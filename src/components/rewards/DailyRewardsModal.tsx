import React, { useState, useEffect } from 'react';
import {
  Gift,
  Flame,
  Sparkles,
  Check,
  Lock,
  X,
  Coins,
  MessageCircle,
  Zap,
  Video,
  Heart,
  Trophy,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DailyMissionItem } from '../../types';

interface DailyRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const DailyRewardsModal: React.FC<DailyRewardsModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const {
    systemSettings,
    dailyRewardRecord,
    claimDailyStreak,
    claimDailyMission,
    claimDailyMasterChest,
    hasUnclaimedDailyRewards,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'streak' | 'missions'>('streak');
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [celebrationCoins, setCelebrationCoins] = useState<number | null>(null);

  // Sound chime synthesizer using Web Audio API
  const playCoinChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Note 1: E5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: B5
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.1);
      gain2.gain.setValueAtTime(0.2, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.55);
    } catch {}
  };

  // Streak rewards configuration
  const streakRewards = systemSettings.dailyStreakRewards || [10, 15, 20, 25, 35, 50, 100];
  const missionsConfig = systemSettings.dailyMissionsConfig || {
    chatFriends: { target: 3, reward: 25, enabled: true },
    quickMatches: { target: 10, reward: 30, enabled: true },
    videoCall: { target: 60, reward: 35, enabled: true },
    momentInteract: { target: 3, reward: 15, enabled: true },
    sendGift: { target: 1, reward: 20, enabled: true },
    masterChest: { target: 4, reward: 50, enabled: true },
  };

  const currentStreakDay = dailyRewardRecord?.streakCount || 1;
  const localRewardDay = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isStreakClaimedToday = Boolean(
    dailyRewardRecord?.streakClaimedDate &&
      dailyRewardRecord.streakClaimedDate === localRewardDay
  );

  // Compute Daily Missions
  const missions: DailyMissionItem[] = [
    {
      key: 'chat_friends',
      title: 'Social Butterfly',
      description: `Send messages to ${missionsConfig.chatFriends?.target || 3} different friends or creators`,
      target: missionsConfig.chatFriends?.target || 3,
      current: Math.min(
        dailyRewardRecord?.taskChatFriends?.length || 0,
        missionsConfig.chatFriends?.target || 3
      ),
      rewardCoins: missionsConfig.chatFriends?.reward || 25,
      claimed: Boolean(dailyRewardRecord?.taskChatClaimed),
      icon: 'MessageCircle',
      actionTab: 'messages',
      actionText: 'Open Chat',
      enabled: missionsConfig.chatFriends?.enabled !== false,
    },
    {
      key: 'quick_matches',
      title: 'Radar Explorer',
      description: `Complete ${missionsConfig.quickMatches?.target || 10} Quick Match connections`,
      target: missionsConfig.quickMatches?.target || 10,
      current: Math.min(
        dailyRewardRecord?.taskQuickMatches || 0,
        missionsConfig.quickMatches?.target || 10
      ),
      rewardCoins: missionsConfig.quickMatches?.reward || 30,
      claimed: Boolean(dailyRewardRecord?.taskQuickMatchClaimed),
      icon: 'Zap',
      actionTab: 'match',
      actionText: 'Start Match',
      enabled: missionsConfig.quickMatches?.enabled !== false,
    },
    {
      key: 'video_call',
      title: 'Live Connection',
      description: `Talk in a 1-on-1 video call for at least ${Math.max(
        1,
        Math.round((missionsConfig.videoCall?.target || 60) / 60)
      )} min (${missionsConfig.videoCall?.target || 60}s)`,
      target: missionsConfig.videoCall?.target || 60,
      current: Math.min(
        dailyRewardRecord?.taskVideoCallSeconds || 0,
        missionsConfig.videoCall?.target || 60
      ),
      rewardCoins: missionsConfig.videoCall?.reward || 35,
      claimed: Boolean(dailyRewardRecord?.taskVideoCallClaimed),
      icon: 'Video',
      actionTab: 'discovery',
      actionText: 'Find Creator',
      enabled: missionsConfig.videoCall?.enabled !== false,
    },
    {
      key: 'moment_interact',
      title: 'Community Explorer',
      description: `Like or comment on ${missionsConfig.momentInteract?.target || 3} creator moments`,
      target: missionsConfig.momentInteract?.target || 3,
      current: Math.min(
        dailyRewardRecord?.taskMomentInteractions || 0,
        missionsConfig.momentInteract?.target || 3
      ),
      rewardCoins: missionsConfig.momentInteract?.reward || 15,
      claimed: Boolean(dailyRewardRecord?.taskMomentClaimed),
      icon: 'Heart',
      actionTab: 'moments',
      actionText: 'View Feed',
      enabled: missionsConfig.momentInteract?.enabled !== false,
    },
    {
      key: 'send_gift',
      title: 'Generous Heart',
      description: `Send at least ${missionsConfig.sendGift?.target || 1} virtual gift in chat or call`,
      target: missionsConfig.sendGift?.target || 1,
      current: Math.min(
        dailyRewardRecord?.taskGiftCount || 0,
        missionsConfig.sendGift?.target || 1
      ),
      rewardCoins: missionsConfig.sendGift?.reward || 20,
      claimed: Boolean(dailyRewardRecord?.taskGiftClaimed),
      icon: 'Gift',
      actionTab: 'discovery',
      actionText: 'Send Gift',
      enabled: missionsConfig.sendGift?.enabled !== false,
    },
  ];

  // Master chest progress (count of completed and claimed daily missions)
  const completedMissionsCount = missions.filter((m) => m.claimed).length;
  const masterTarget = missionsConfig.masterChest?.target || 4;
  const isMasterReady =
    completedMissionsCount >= masterTarget && !dailyRewardRecord?.masterChestClaimed;
  const isMasterClaimed = Boolean(dailyRewardRecord?.masterChestClaimed);
  const masterRewardCoins = missionsConfig.masterChest?.reward || 50;

  // Handle claim streak
  const handleClaimStreak = async () => {
    if (isStreakClaimedToday || claimingKey) return;
    setClaimingKey('streak');
    const dayReward = streakRewards[Math.min(currentStreakDay - 1, 6)] || 20;
    const success = await claimDailyStreak();
    if (success) {
      playCoinChime();
      setCelebrationCoins(dayReward);
      setTimeout(() => setCelebrationCoins(null), 3000);
    }
    setClaimingKey(null);
  };

  // Handle claim mission
  const handleClaimMission = async (mission: DailyMissionItem) => {
    if (mission.claimed || mission.current < mission.target || claimingKey) return;
    setClaimingKey(mission.key);
    const success = await claimDailyMission(mission.key);
    if (success) {
      playCoinChime();
      setCelebrationCoins(mission.rewardCoins);
      setTimeout(() => setCelebrationCoins(null), 3000);
    }
    setClaimingKey(null);
  };

  // Handle claim master chest
  const handleClaimMasterChest = async () => {
    if (!isMasterReady || isMasterClaimed || claimingKey) return;
    setClaimingKey('master_chest');
    const success = await claimDailyMasterChest();
    if (success) {
      playCoinChime();
      setCelebrationCoins(masterRewardCoins);
      setTimeout(() => setCelebrationCoins(null), 3500);
    }
    setClaimingKey(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#12141C] border border-amber-500/30 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] relative">
        
        {/* Celebration Floating Badge */}
        {celebrationCoins !== null && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-8 py-5 rounded-3xl font-black text-2xl shadow-2xl border border-white/40 flex items-center space-x-3 animate-bounce">
            <span className="text-3xl">🪙</span>
            <span>+{celebrationCoins} Free Coins!</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-b from-amber-950/40 via-amber-900/10 to-transparent border-b border-amber-500/20 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shadow-amber-500/20">
              🎁
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Daily Rewards & Quests
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold flex items-center space-x-1">
                  <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />
                  <span>{currentStreakDay}-Day Streak</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Claim free coins every day and complete missions to unlock bonus chests.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2 mt-4">
            <button
              onClick={() => setActiveTab('streak')}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'streak'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>7-Day Check-in</span>
            </button>
            <button
              onClick={() => setActiveTab('missions')}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-1.5 relative ${
                activeTab === 'missions'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Daily Quests</span>
              {missions.some((m) => !m.claimed && m.current >= m.target) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 right-2" />
              )}
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          
          {/* TAB 1: 7-DAY STREAK CALENDAR */}
          {activeTab === 'streak' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Consecutive Login Progress</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Log in every day to grow your streak. Day 7 unlocks the Golden Chest!
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Status</span>
                  <span className={`text-xs font-bold ${isStreakClaimedToday ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
                    {isStreakClaimedToday ? 'Claimed Today ✓' : 'Ready to Claim!'}
                  </span>
                </div>
              </div>

              {/* 7 Day Strip */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const dayCoins = streakRewards[day - 1] || 20;
                  const isPastClaimed = day < currentStreakDay || (day === currentStreakDay && isStreakClaimedToday);
                  const isTodayActive = day === currentStreakDay && !isStreakClaimedToday;
                  const isFuture = day > currentStreakDay;
                  const isDay7 = day === 7;

                  return (
                    <div
                      key={day}
                      className={`relative rounded-2xl p-2.5 flex flex-col items-center justify-between border transition-all text-center ${
                        isTodayActive
                          ? 'bg-gradient-to-b from-amber-500/20 to-yellow-500/10 border-amber-400 shadow-lg shadow-amber-500/20 scale-105 z-10'
                          : isPastClaimed
                          ? 'bg-slate-900/90 border-emerald-500/30 opacity-90'
                          : 'bg-slate-900/50 border-slate-800/80 opacity-70'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                        Day {day}
                      </span>

                      {/* Icon Container */}
                      <div className="my-1.5">
                        {isPastClaimed ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : isDay7 ? (
                          <div className="w-7 h-7 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold text-sm animate-bounce">
                            🏆
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-amber-400/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                            🪙
                          </div>
                        )}
                      </div>

                      <span className="text-[11px] font-black text-amber-300 font-mono">
                        +{dayCoins}
                      </span>

                      {/* Day 7 badge */}
                      {isDay7 && (
                        <span className="text-[8px] bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black px-1 rounded-full uppercase mt-1">
                          Chest
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleClaimStreak}
                  disabled={isStreakClaimedToday || claimingKey === 'streak'}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm transition-all shadow-xl flex items-center justify-center space-x-2 ${
                    isStreakClaimedToday
                      ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-slate-950 shadow-amber-500/25 active:scale-98 animate-pulse'
                  }`}
                >
                  <Gift className="w-4 h-4" />
                  <span>
                    {isStreakClaimedToday
                      ? `Day ${currentStreakDay} Claimed! Come Back Tomorrow`
                      : `Claim Day ${currentStreakDay} (+${
                          streakRewards[currentStreakDay - 1] || 20
                        } Coins)`}
                  </span>
                </button>
              </div>

              {/* Lifetime free earnings stat */}
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Total Free Coins Earned via Quests:</span>
                <span className="font-mono font-bold text-amber-400">
                  🪙 {(dailyRewardRecord?.totalCoinsEarned || 0).toLocaleString()} Coins
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: DAILY MISSIONS BOARD */}
          {activeTab === 'missions' && (
            <div className="space-y-3.5">
              
              {/* Daily Master Chest Progress Bar */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-purple-950/30 to-indigo-950/40 border border-amber-500/30 flex items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Daily Master Chest
                    </h4>
                    <span className="text-[10px] font-mono text-amber-400 font-bold">
                      ({completedMissionsCount}/{masterTarget})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Complete any {masterTarget} daily missions to claim +{masterRewardCoins} bonus coins!
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-2 mt-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-400 to-yellow-500 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (completedMissionsCount / masterTarget) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleClaimMasterChest}
                  disabled={!isMasterReady || isMasterClaimed}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all shrink-0 ${
                    isMasterClaimed
                      ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                      : isMasterReady
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30 animate-bounce'
                      : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 cursor-not-allowed'
                  }`}
                >
                  {isMasterClaimed ? 'Claimed ✓' : isMasterReady ? `Open Chest (+${masterRewardCoins})` : `Locked (${completedMissionsCount}/${masterTarget})`}
                </button>
              </div>

              {/* Individual Mission Cards */}
              <div className="space-y-2.5">
                {missions.filter(m => m.enabled).map((mission) => {
                  const isReadyToClaim = !mission.claimed && mission.current >= mission.target;
                  const percent = Math.min(100, Math.round((mission.current / mission.target) * 100));

                  const getIcon = () => {
                    switch (mission.icon) {
                      case 'MessageCircle':
                        return <MessageCircle className="w-4 h-4 text-sky-400" />;
                      case 'Zap':
                        return <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />;
                      case 'Video':
                        return <Video className="w-4 h-4 text-indigo-400" />;
                      case 'Heart':
                        return <Heart className="w-4 h-4 text-pink-400" />;
                      case 'Gift':
                        return <Gift className="w-4 h-4 text-emerald-400" />;
                      default:
                        return <Sparkles className="w-4 h-4 text-amber-400" />;
                    }
                  };

                  return (
                    <div
                      key={mission.key}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        mission.claimed
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-75'
                          : isReadyToClaim
                          ? 'bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/40 shadow-md shadow-emerald-500/10'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start space-x-3 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-slate-800/90 flex items-center justify-center shrink-0 mt-0.5">
                          {getIcon()}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-xs font-bold text-white">
                              {mission.title}
                            </h4>
                            <span className="text-[10px] font-mono font-bold text-amber-400 px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/20">
                              +{mission.rewardCoins} 🪙
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight">
                            {mission.description}
                          </p>

                          {/* Progress Line */}
                          <div className="flex items-center space-x-2 pt-1">
                            <div className="w-28 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  mission.claimed
                                    ? 'bg-slate-600'
                                    : isReadyToClaim
                                    ? 'bg-emerald-400'
                                    : 'bg-amber-400'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {mission.current}/{mission.target}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action / Claim Button */}
                      <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                        {mission.claimed ? (
                          <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-500 text-xs font-bold font-mono">
                            Claimed ✓
                          </span>
                        ) : isReadyToClaim ? (
                          <button
                            onClick={() => handleClaimMission(mission)}
                            disabled={claimingKey === mission.key}
                            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 animate-pulse"
                          >
                            Claim +{mission.rewardCoins} 🪙
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              onClose();
                              if (mission.actionTab && onNavigateTab) {
                                onNavigateTab(mission.actionTab);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs flex items-center space-x-1 transition-all"
                          >
                            <span>{mission.actionText || 'Go'}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-950/80 border-t border-slate-800/80 text-center shrink-0">
          <p className="text-[10px] text-slate-500">
            Missions reset daily at 00:00 UTC. Free coins are directly credited to your main wallet balance.
          </p>
        </div>
      </div>
    </div>
  );
};
