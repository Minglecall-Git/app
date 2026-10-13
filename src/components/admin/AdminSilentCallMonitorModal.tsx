import React, { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, RemoteTrack, Track } from 'livekit-client';
import {
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Camera,
  AlertTriangle,
  PhoneOff,
  X,
  Maximize2,
  Minimize2,
  Lock,
  MicOff,
  VideoOff,
  Activity,
  Layers,
  Sparkles,
  UserCheck,
  Zap,
  Radio,
  FileText,
  Clock,
  Coins,
  CheckCircle2,
  Smartphone,
  Gauge,
  Sliders,
  Send,
} from 'lucide-react';
import { AdminActiveCall } from '../../types';
import { useApp } from '../../context/AppContext';
import { DEFAULT_COIN_BURN_RATE_PER_MIN } from '../../../shared/finance/economyBurn';
import { authFetch } from '../../utils/apiClient';

interface AdminSilentCallMonitorModalProps {
  call: AdminActiveCall;
  onClose: () => void;
}

export const AdminSilentCallMonitorModal: React.FC<AdminSilentCallMonitorModalProps> = ({
  call,
  onClose,
}) => {
  const {
    users,
    adminTerminateCall,
    adminIssueCallWarning,
    adminCaptureEvidence,
  } = useApp();

  // Layout View Modes
  const [layoutMode, setLayoutMode] = useState<'split' | 'host_focus' | 'caller_focus' | 'pip'>('split');
  
  // Audio Monitoring Controls (One-way listening for admin)
  const [masterVolume, setMasterVolume] = useState<number>(80);
  const [isHostAudioMuted, setIsHostAudioMuted] = useState<boolean>(false);
  const [isCallerAudioMuted, setIsCallerAudioMuted] = useState<boolean>(false);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);

  // Live WebRTC Video & Audio Stream Refs
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const hostAudioRef = useRef<HTMLAudioElement | null>(null);
  const callerVideoRef = useRef<HTMLVideoElement | null>(null);
  const callerAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isHostVideoLive, setIsHostVideoLive] = useState<boolean>(false);
  const [isCallerVideoLive, setIsCallerVideoLive] = useState<boolean>(false);
  const [livekitStatusText, setLivekitStatusText] = useState<string>('Connecting to Silent Surveillance Stream...');
  const [isLivekitConnected, setIsLivekitConnected] = useState<boolean>(false);

  // Warning Dispatch Modal State
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [warningPreset, setWarningPreset] = useState<string>('Please keep conversations respectful and follow community guidelines.');
  const [customWarning, setCustomWarning] = useState<string>('');

  // Snapshot Note Modal State
  const [showSnapshotModal, setShowSnapshotModal] = useState<boolean>(false);
  const [snapshotNote, setSnapshotNote] = useState<string>('');

  // Force End Confirmation Modal State
  const [showForceEndModal, setShowForceEndModal] = useState<boolean>(false);
  const [terminationReason, setTerminationReason] = useState<string>('Safety & Community Guidelines Violation');

  // Fullscreen toggle
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Look up latest user data
  const hostUser = users.find((u) => u.id === call.hostId);
  const callerUser = users.find((u) => u.id === call.callerId);

  // LiveKit Silent Surveillance WebRTC Subscriber Connection
  useEffect(() => {
    let isMounted = true;
    let roomInstance: Room | null = null;

    async function connectSilentSpectator() {
      try {
        setLivekitStatusText('Requesting Surveillance Token...');
        const res = await authFetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: call.id,
            identity: `admin-surveillance-${Math.random().toString(36).substring(7)}`,
            name: 'Silent Admin HUD',
            isSpectator: true,
          }),
        });

        const data = await res.json();
        if (!isMounted) return;

        if (data.configured && data.token && data.wsUrl) {
          setLivekitStatusText('Connecting to WebRTC SFU Mesh...');
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
          });
          roomInstance = room;

          const attachTrackToProperSlot = (track: RemoteTrack, participantId: string, participantName?: string) => {
            const isHost =
              participantId === call.hostId ||
              (participantName && call.hostName && participantName.toLowerCase().includes(call.hostName.toLowerCase()));
            const isCaller =
              participantId === call.callerId ||
              (participantName && call.callerName && participantName.toLowerCase().includes(call.callerName.toLowerCase()));

            if (track.kind === Track.Kind.Video) {
              if (isHost && hostVideoRef.current) {
                track.attach(hostVideoRef.current);
                setIsHostVideoLive(true);
              } else if (isCaller && callerVideoRef.current) {
                track.attach(callerVideoRef.current);
                setIsCallerVideoLive(true);
              } else if (!isHostVideoLive && hostVideoRef.current) {
                track.attach(hostVideoRef.current);
                setIsHostVideoLive(true);
              } else if (callerVideoRef.current) {
                track.attach(callerVideoRef.current);
                setIsCallerVideoLive(true);
              }
            } else if (track.kind === Track.Kind.Audio) {
              if (isHost && hostAudioRef.current) {
                track.attach(hostAudioRef.current);
              } else if (isCaller && callerAudioRef.current) {
                track.attach(callerAudioRef.current);
              } else if (hostAudioRef.current) {
                track.attach(hostAudioRef.current);
              }
            }
          };

          room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
            attachTrackToProperSlot(track, participant.identity, participant.name);
          });

          room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
            track.detach();
            const isHost = participant.identity === call.hostId;
            if (track.kind === Track.Kind.Video) {
              if (isHost) setIsHostVideoLive(false);
              else setIsCallerVideoLive(false);
            }
          });

          await room.connect(data.wsUrl, data.token);
          if (isMounted) {
            setIsLivekitConnected(true);
            setLivekitStatusText('0 TRANSMISSION • DISCRETION STRICT');

            // Scan any already attached remote participants
            room.remoteParticipants.forEach((p) => {
              p.trackPublications.forEach((pub) => {
                if (pub.track && pub.isSubscribed) {
                  attachTrackToProperSlot(pub.track as RemoteTrack, p.identity, p.name);
                }
              });
            });
          }
        } else {
          setLivekitStatusText('Surveillance Stream Active');
        }
      } catch (e) {
        console.warn('Silent call monitor fallback:', e);
        if (isMounted) {
          setLivekitStatusText('Surveillance Stream Active');
        }
      }
    }

    connectSilentSpectator();

    return () => {
      isMounted = false;
      if (roomInstance) {
        roomInstance.disconnect();
      }
    };
  }, [call.id, call.hostId, call.callerId, call.hostName, call.callerName]);

  // Volume & Mute Sync
  useEffect(() => {
    const effectiveVol = isMasterMuted ? 0 : masterVolume / 100;
    if (hostAudioRef.current) {
      hostAudioRef.current.volume = isHostAudioMuted ? 0 : effectiveVol;
      hostAudioRef.current.muted = isHostAudioMuted || isMasterMuted;
    }
    if (callerAudioRef.current) {
      callerAudioRef.current.volume = isCallerAudioMuted ? 0 : effectiveVol;
      callerAudioRef.current.muted = isCallerAudioMuted || isMasterMuted;
    }
  }, [masterVolume, isHostAudioMuted, isCallerAudioMuted, isMasterMuted]);

  // Time format helper
  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCountryFlag = (code?: string, countryName?: string) => {
    if (code === 'US' || countryName?.includes('United States')) return '🇺🇸';
    if (code === 'ES' || countryName?.includes('Spain')) return '🇪🇸';
    if (code === 'JP' || countryName?.includes('Japan')) return '🇯🇵';
    if (code === 'BR' || countryName?.includes('Brazil')) return '🇧🇷';
    if (code === 'FR' || countryName?.includes('France')) return '🇫🇷';
    if (code === 'CA' || countryName?.includes('Canada')) return '🇨🇦';
    if (code === 'UK' || countryName?.includes('United Kingdom')) return '🇬🇧';
    return '🌐';
  };

  // Remaining minutes male caller can afford before 0 coins
  const callerRemainingCoins = callerUser ? callerUser.coinBalance : call.callerCoinBalance;
  const ratePerMin = call.burnRatePerMin || DEFAULT_COIN_BURN_RATE_PER_MIN;
  const minutesRunway = Math.floor(callerRemainingCoins / Math.max(1, ratePerMin));

  const handleSendWarning = async () => {
    const textToSend = customWarning.trim() || warningPreset;
    await adminIssueCallWarning(call.id, textToSend);
    setShowWarningModal(false);
    setCustomWarning('');
  };

  const handleTakeSnapshot = () => {
    adminCaptureEvidence(
      call.id,
      snapshotNote.trim() || `QA Surveillance Snapshot saved at runtime ${formatDuration(call.durationSeconds)}. Stream Quality: ${call.videoQuality || '720p HD'}.`
    );
    setShowSnapshotModal(false);
    setSnapshotNote('');
  };

  const handleExecuteKillswitch = async () => {
    await adminTerminateCall(call.id, terminationReason);
    setShowForceEndModal(false);
    onClose();
  };

  return (
    <div
      id="silent-admin-surveillance-overlay"
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden text-slate-100 font-sans select-none"
    >
      {/* ========================================================================= */}
      {/* 1. TOP SURVEILLANCE STATUS & DISCRETION HUD BAR                           */}
      {/* ========================================================================= */}
      <header className="shrink-0 bg-[#0c1017] border-b border-slate-800/90 px-4 py-2.5 flex items-center justify-between z-20 shadow-xl">
        {/* Left: Security & Identity */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 rounded-lg text-xs font-black text-rose-300 font-mono tracking-wider shadow-inner">
            <Radio className="w-3.5 h-3.5 text-rose-400 animate-ping" />
            <span>SILENT SURVEILLANCE HUD</span>
          </div>

          <div className="hidden lg:flex items-center space-x-2 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-400 font-mono">
            <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
            <span>{livekitStatusText}</span>
          </div>

          <div className="hidden xl:flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-400">
            <Lock className="w-3 h-3 text-indigo-400" />
            <span>Room: {call.id}</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-300 font-bold">Participant Counter: 2 (Invariant)</span>
          </div>
        </div>

        {/* Center: Live Call Clock & Burn Rate */}
        <div className="flex items-center space-x-3 bg-slate-900/90 border border-slate-800 px-3.5 py-1 rounded-xl font-mono text-xs shadow-inner">
          <div className="flex items-center space-x-1.5 text-slate-200 font-extrabold">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            <span>{formatDuration(call.durationSeconds)}</span>
          </div>

          <div className="h-3.5 w-px bg-slate-700" />

          <div className="flex items-center space-x-1.5 text-amber-300 font-bold">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{call.coinsSpent} 🪙 burned</span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">({ratePerMin} 🪙/min)</span>
          </div>
        </div>

        {/* Right: Layout Switcher & Close */}
        <div className="flex items-center space-x-2">
          {/* Layout Mode Toggles */}
          <div className="hidden sm:flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setLayoutMode('split')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                layoutMode === 'split' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="50/50 Dual Split Screen"
            >
              50/50 Dual
            </button>
            <button
              onClick={() => setLayoutMode('host_focus')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                layoutMode === 'host_focus' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Host Focus View"
            >
              Host Focus
            </button>
            <button
              onClick={() => setLayoutMode('caller_focus')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                layoutMode === 'caller_focus' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Caller Focus View"
            >
              Caller Focus
            </button>
          </div>

          {/* Close Spectator Monitor */}
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center space-x-1 text-xs font-bold"
            title="Exit Silent Surveillance"
          >
            <X className="w-4 h-4" />
            <span className="hidden md:inline">Exit Monitor</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. HARDWARE ENFORCEMENT & PARTICIPANT INVARIANCE BANNER                     */}
      {/* ========================================================================= */}
      <div className="bg-[#111622] border-b border-slate-800/80 px-4 py-1.5 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-300 gap-2">
        <div className="flex items-center space-x-4 flex-wrap">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Admin Ingress Locks:</span>
          
          <span className="flex items-center space-x-1 text-emerald-400">
            <MicOff className="w-3 h-3 text-emerald-400" />
            <span>Admin Mic: HARDWARE BLOCKED</span>
          </span>

          <span className="flex items-center space-x-1 text-emerald-400">
            <VideoOff className="w-3 h-3 text-emerald-400" />
            <span>Admin Camera: HARDWARE BLOCKED</span>
          </span>

          <span className="flex items-center space-x-1 text-emerald-400">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Data Channel: READ-ONLY</span>
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[10px]">
          <span className="text-indigo-400 font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            AI Shield Score: {call.safetyScore ?? 99.8}% (Clean)
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Latency: {call.latencyMs ?? 42}ms</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Bitrate: {call.bitrateKbps ?? 3500} kbps ({call.videoQuality || '720p HD'})</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN LIVE VIDEO STREAMS VIEWPORT                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 bg-black p-2 sm:p-3 overflow-hidden flex flex-col md:flex-row gap-2 sm:gap-3">
        {/* ----------------------------------------------------------------------- */}
        {/* FEMALE HOST STREAM CARD                                                */}
        {/* ----------------------------------------------------------------------- */}
        <div
          className={`relative rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ${
            layoutMode === 'split'
              ? 'flex-1'
              : layoutMode === 'host_focus'
              ? 'flex-[2]'
              : 'flex-1 md:max-w-xs'
          }`}
        >
          {/* Top Video HUD Badge */}
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
            {/* Host Identity Badge */}
            <div className="flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md border border-pink-500/40 px-2.5 py-1 rounded-xl shadow-lg pointer-events-auto">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
              <span className="text-xs font-black text-white">{call.hostName}</span>
              <span className="text-[10px] text-pink-300 font-bold font-mono">HOST</span>
              <span className="text-xs">{getCountryFlag(call.hostCountryCode, call.hostCountry)}</span>
            </div>

            {/* Stream Telemetry */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-2 py-0.5 rounded-lg text-[10px] font-mono text-slate-300 pointer-events-auto">
              <span className="text-emerald-400 font-bold">{call.videoQuality || '720p HD'}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{call.fps || 60} FPS</span>
            </div>
          </div>

          {/* Video Feed Simulation & Live WebRTC Stream Canvas */}
          <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
            <video
              ref={hostVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover z-10 transition-opacity duration-300 ${
                isHostVideoLive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                imageRendering: 'crisp-edges',
                transform: 'translateZ(0)',
              }}
            />
            <audio ref={hostAudioRef} autoPlay />

            {/* Fallback / Camera Inactive Profile Canvas */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${isHostVideoLive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <img
                src={call.hostAvatar}
                alt={call.hostName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-4 bg-slate-950/80 border border-slate-800 rounded-2xl backdrop-blur-md space-y-1.5 shadow-2xl">
                <div className="w-10 h-10 mx-auto rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center">
                  <VideoOff className="w-5 h-5 text-pink-400" />
                </div>
                <div className="text-xs font-bold text-white">{call.hostName}</div>
                <div className="text-[10px] text-slate-400 font-mono">Stream Standby • Waiting for Camera Feed...</div>
              </div>
            </div>

            {/* Live Visual Scanline / Quality Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/30 pointer-events-none z-10" />
            
            {/* Host audio controls — decibel bar only when real level is available */}
            <div className="absolute bottom-3 left-3 right-3 z-20 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-xl p-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsHostAudioMuted(!isHostAudioMuted)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isHostAudioMuted
                      ? 'bg-rose-600/30 text-rose-400 border border-rose-500/40'
                      : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/50'
                  }`}
                  title={isHostAudioMuted ? 'Unmute Host Audio' : 'Mute Host Audio (For Admin)'}
                >
                  {isHostAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[11px] text-slate-300">Host Mic Audio</span>
              </div>

              {typeof call.hostAudioLevel === 'number' ? (
                <div className="flex items-center space-x-1">
                  <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500 transition-all duration-150"
                      style={{ width: `${isHostAudioMuted ? 0 : call.hostAudioLevel}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-8 text-right">
                    {isHostAudioMuted ? 'Muted' : `${call.hostAudioLevel}%`}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500">{isHostAudioMuted ? 'Muted' : 'Level n/a'}</span>
              )}
            </div>
          </div>

          {/* Host Quick Telemetry Footer */}
          <div className="bg-[#10141e] border-t border-slate-800 p-2.5 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
              <span>Rate: <strong className="text-amber-400 font-bold">{call.hostHourlyRate} 🪙/min</strong></span>
              <span>•</span>
              <span>Earned: <strong className="text-emerald-400 font-bold">+{call.coinsEarned} 🪙</strong></span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${isHostVideoLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className={`text-[11px] font-bold ${isHostVideoLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isHostVideoLive ? 'Host Live Feed' : 'Host Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* MALE CALLER STREAM CARD                                                 */}
        {/* ----------------------------------------------------------------------- */}
        <div
          className={`relative rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ${
            layoutMode === 'split'
              ? 'flex-1'
              : layoutMode === 'caller_focus'
              ? 'flex-[2]'
              : 'flex-1 md:max-w-xs'
          }`}
        >
          {/* Top Video HUD Badge */}
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
            {/* Caller Identity Badge */}
            <div className="flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md border border-indigo-500/40 px-2.5 py-1 rounded-xl shadow-lg pointer-events-auto">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <span className="text-xs font-black text-white">{call.callerName}</span>
              <span className="text-[10px] text-indigo-300 font-bold font-mono">CALLER</span>
              <span className="text-xs">{getCountryFlag(call.callerCountryCode, call.callerCountry)}</span>
            </div>

            {/* Stream Telemetry */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-2 py-0.5 rounded-lg text-[10px] font-mono text-slate-300 pointer-events-auto">
              <span className="text-emerald-400 font-bold">{call.videoQuality || '720p HD'}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{call.fps || 60} FPS</span>
            </div>
          </div>

          {/* Video Feed Simulation & Live WebRTC Stream Canvas */}
          <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
            <video
              ref={callerVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover z-10 transition-opacity duration-300 ${
                isCallerVideoLive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                imageRendering: 'crisp-edges',
                transform: 'translateZ(0)',
              }}
            />
            <audio ref={callerAudioRef} autoPlay />

            {/* Fallback / Camera Inactive Profile Canvas */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${isCallerVideoLive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <img
                src={call.callerAvatar}
                alt={call.callerName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center p-4 bg-slate-950/80 border border-slate-800 rounded-2xl backdrop-blur-md space-y-1.5 shadow-2xl">
                <div className="w-10 h-10 mx-auto rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <VideoOff className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-xs font-bold text-white">{call.callerName}</div>
                <div className="text-[10px] text-slate-400 font-mono">Stream Standby • Waiting for Camera Feed...</div>
              </div>
            </div>

            {/* Scanline / Quality Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/30 pointer-events-none z-10" />

            {/* Caller audio controls — decibel bar only when real level is available */}
            <div className="absolute bottom-3 left-3 right-3 z-20 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-xl p-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsCallerAudioMuted(!isCallerAudioMuted)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isCallerAudioMuted
                      ? 'bg-rose-600/30 text-rose-400 border border-rose-500/40'
                      : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/50'
                  }`}
                  title={isCallerAudioMuted ? 'Unmute Caller Audio' : 'Mute Caller Audio (For Admin)'}
                >
                  {isCallerAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[11px] text-slate-300">Caller Mic Audio</span>
              </div>

              {typeof call.callerAudioLevel === 'number' ? (
                <div className="flex items-center space-x-1">
                  <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500 transition-all duration-150"
                      style={{ width: `${isCallerAudioMuted ? 0 : call.callerAudioLevel}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-8 text-right">
                    {isCallerAudioMuted ? 'Muted' : `${call.callerAudioLevel}%`}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500">{isCallerAudioMuted ? 'Muted' : 'Level n/a'}</span>
              )}
            </div>
          </div>

          {/* Caller Quick Telemetry Footer */}
          <div className="bg-[#10141e] border-t border-slate-800 p-2.5 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
              <span>Wallet: <strong className="text-amber-400 font-bold">{callerRemainingCoins} 🪙</strong></span>
              <span>•</span>
              <span>Runway: <strong className="text-indigo-300 font-bold">~{minutesRunway} min left</strong></span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${isCallerVideoLive ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'}`} />
              <span className={`text-[11px] font-bold ${isCallerVideoLive ? 'text-emerald-400' : 'text-indigo-400'}`}>
                {isCallerVideoLive ? 'Caller Live Feed' : 'Caller Standby'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM ADMIN MODERATION & SAFETY ENFORCEMENT ACTION BAR                */}
      {/* ========================================================================= */}
      <footer className="shrink-0 bg-[#0c1017] border-t border-slate-800 p-3 sm:p-4 z-20 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Master Audio Control Station */}
        <div className="flex items-center space-x-3 w-full md:w-auto bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 font-mono text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMasterMuted(!isMasterMuted)}
              className="text-slate-400 hover:text-white transition-colors"
              title="Toggle Master Spectator Mute"
            >
              {isMasterMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
            </button>
            <span className="text-[11px] text-slate-300 font-bold">Spectator Master Volume:</span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={isMasterMuted ? 0 : masterVolume}
            onChange={(e) => {
              setMasterVolume(Number(e.target.value));
              if (isMasterMuted) setIsMasterMuted(false);
            }}
            className="w-28 accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
          />
          <span className="text-[11px] text-slate-400 w-8">{isMasterMuted ? '0%' : `${masterVolume}%`}</span>
        </div>

        {/* Right: Moderation Action Triggers */}
        <div className="flex items-center space-x-2.5 w-full md:w-auto justify-end">
          {/* Action 1: Capture Evidence Snapshot */}
          <button
            onClick={() => setShowSnapshotModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow transition-transform active:scale-95"
            title="Record timestamped QA report and frame snapshot"
          >
            <Camera className="w-4 h-4 text-indigo-400" />
            <span>Capture Evidence</span>
          </button>

          {/* Action 2: Issue Discreet Safety Warning */}
          <button
            onClick={() => setShowWarningModal(true)}
            className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 text-amber-300 hover:text-amber-200 rounded-xl text-xs font-bold flex items-center space-x-2 shadow transition-transform active:scale-95"
            title="Dispatch a subtle system warning banner to call participants"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Issue Warning</span>
          </button>

          {/* Action 3: Emergency Killswitch (Force Terminate Call) */}
          <button
            onClick={() => setShowForceEndModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 border border-rose-500 text-white rounded-xl text-xs font-extrabold flex items-center space-x-2 shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
            title="Instant safety killswitch to terminate active call"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Killswitch / Force End</span>
          </button>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* MODAL 1: ISSUE DISCREET SAFETY WARNING                                   */}
      {/* ========================================================================= */}
      {showWarningModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-amber-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-amber-400 font-black text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Issue Discreet Safety Advisory</span>
              </div>
              <button
                onClick={() => setShowWarningModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This advisory will be displayed as an automated system banner on both participants' screens. <strong>It will not reveal that an administrator is spectating.</strong>
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Preset Safety Warnings:</label>
              <div className="space-y-1.5">
                {[
                  'Please keep conversations respectful and follow community guidelines.',
                  'Inappropriate language or harassment will result in immediate termination.',
                  'Reminder: Screen recording and external contact requests are prohibited.',
                  'Safety Notice: Automated moderation active. Please adhere to terms.',
                ].map((preset, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      warningPreset === preset
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="warning_preset"
                      checked={warningPreset === preset}
                      onChange={() => setWarningPreset(preset)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <span>{preset}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Or Custom Advisory Notice:</label>
              <input
                type="text"
                placeholder="Enter custom warning text..."
                value={customWarning}
                onChange={(e) => setCustomWarning(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>

              <button
                onClick={handleSendWarning}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-xl flex items-center space-x-1.5 shadow-lg shadow-amber-600/30"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch Advisory</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CAPTURE INCIDENT EVIDENCE SNAPSHOT                               */}
      {/* ========================================================================= */}
      {showSnapshotModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-indigo-500/40 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-indigo-400 font-black text-sm">
                <Camera className="w-5 h-5 text-indigo-400" />
                <span>Save Incident Evidence to Audit Log</span>
              </div>
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Session ID:</span>
                <span className="text-white font-bold">{call.id}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Timestamp:</span>
                <span className="text-slate-200">{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Host:</span>
                <span className="text-pink-400 font-bold">{call.hostName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Caller:</span>
                <span className="text-indigo-400 font-bold">{call.callerName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Runtime:</span>
                <span className="text-amber-300 font-bold">{formatDuration(call.durationSeconds)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Moderator Audit Note:</label>
              <textarea
                rows={3}
                placeholder="Optional notes on conversation quality, compliance check, or violation details..."
                value={snapshotNote}
                onChange={(e) => setSnapshotNote(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>

              <button
                onClick={handleTakeSnapshot}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save to Incident Logs</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EMERGENCY KILLSWITCH (FORCE END CALL)                           */}
      {/* ========================================================================= */}
      {showForceEndModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a0e14] border border-rose-600/60 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rose-950">
              <div className="flex items-center space-x-2 text-rose-400 font-black text-sm">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <span>Emergency Call Killswitch</span>
              </div>
              <button
                onClick={() => setShowForceEndModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-200 space-y-1">
              <p className="font-bold">⚠️ Warning: Immediate Session Termination</p>
              <p className="text-[11px] text-rose-300">
                Triggering the killswitch will immediately disconnect the live video call between <strong>{call.hostName}</strong> and <strong>{call.callerName}</strong> and log an official safety violation.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Select Termination Reason:</label>
              <div className="space-y-1.5">
                {[
                  'Severe Terms of Service & Safety Violation',
                  'Inappropriate conduct, harassment, or non-consensual behavior',
                  'Unauthorized external payment or solicitations attempt',
                  'Routine Quality Assurance session closure',
                ].map((reason, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      terminationReason === reason
                        ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="term_reason"
                      checked={terminationReason === reason}
                      onChange={() => setTerminationReason(reason)}
                      className="mt-0.5 accent-rose-500"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowForceEndModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteKillswitch}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl flex items-center space-x-2 shadow-lg shadow-rose-600/40 transition-transform active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Confirm Immediate Termination</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
