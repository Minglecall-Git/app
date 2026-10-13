import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Loader2,
  Camera,
  Check,
  Sparkles,
  Image as ImageIcon,
  Link as LinkIcon,
  Crown,
  User,
  RefreshCw,
} from 'lucide-react';
import { uploadMediaDirectlyToR2, isPersistableMediaUrl } from '../../utils/r2Storage';
import {
  FEMALE_PORTRAIT_AVATARS,
  MALE_PORTRAIT_AVATARS,
  TEAM_LEADER_AVATARS,
  STYLIZED_3D_AVATARS,
  ILLUSTRATED_ANIME_AVATARS,
  getFallbackAvatar,
} from '../../utils/avatars';

import { UserRole } from '../../types';

interface AvatarUploaderSelectorProps {
  currentAvatarUrl: string;
  onAvatarChange: (newUrl: string) => void;
  targetRole?: UserRole | string;
  targetName?: string;
  accentColor?: 'amber' | 'indigo' | 'rose';
  title?: string;
  description?: string;
}

export const AvatarUploaderSelector: React.FC<AvatarUploaderSelectorProps> = ({
  currentAvatarUrl,
  onAvatarChange,
  targetRole = 'female_creator',
  targetName = 'User',
  accentColor = 'amber',
  title = 'Profile Picture (Avatar)',
  description = 'Upload from your device to Cloudflare R2 or choose from high-definition avatars.',
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | '3d' | 'executive' | 'upload' | 'url'>('presets');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fallbackUrl = getFallbackAvatar(targetName, targetRole === 'female_creator' ? 'female' : 'male', targetRole);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setUploadError('Image size exceeds 15MB limit.');
      return;
    }

    setUploadError(null);
    setUploadSuccess(false);
    setIsUploading(true);
    setUploadProgress(20);

    try {
      const res = await uploadMediaDirectlyToR2({
        file,
        category: 'avatar',
        onProgress: (p) => setUploadProgress(Math.max(20, p)),
      });

      if (res?.publicUrl && isPersistableMediaUrl(res.publicUrl)) {
        onAvatarChange(res.publicUrl);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 4000);
      } else {
        throw new Error('Upload completed but no cloud storage URL was returned');
      }
    } catch (err: any) {
      console.error('Avatar upload to storage failed:', err?.message || err);
      setUploadError(err?.message || 'Failed to upload image to Cloudflare R2. Please try again.');
      setUploadSuccess(false);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleApplyCustomUrl = () => {
    if (!customUrlInput.trim()) return;
    onAvatarChange(customUrlInput.trim());
    setCustomUrlInput('');
  };

  const ringColorClass =
    accentColor === 'rose'
      ? 'ring-rose-500 border-rose-500/50'
      : accentColor === 'indigo'
      ? 'ring-indigo-500 border-indigo-500/50'
      : 'ring-amber-400 border-amber-500/50';

  const badgeBgClass =
    accentColor === 'rose'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      : accentColor === 'indigo'
      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
      : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-3.5">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-1.5 rounded-lg ${badgeBgClass}`}>
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-200 text-xs sm:text-sm">{title}</h4>
            <p className="text-[10px] text-slate-400">{description}</p>
          </div>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeBgClass}`}>
          ☁️ R2 Storage
        </span>
      </div>

      {/* Main Preview & Quick Actions */}
      <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="relative shrink-0">
          <img
            src={currentAvatarUrl || fallbackUrl}
            alt={targetName || 'Avatar Preview'}
            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl object-cover ring-2 ${ringColorClass} shadow-lg bg-slate-900 transition-all`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackUrl;
            }}
          />
          {isUploading && (
            <div className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-xs flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-emerald-500 text-[9px] font-bold text-slate-950 rounded-full uppercase tracking-wider shadow">
            Active
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 truncate">
              {targetName} ({targetRole.replace('_', ' ')})
            </span>
            <button
              type="button"
              onClick={() => onAvatarChange(fallbackUrl)}
              className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset to generated SVG avatar"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp,image/jpg,image/gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                accentColor === 'rose'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/40 shadow-md'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40 shadow-md'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading ({uploadProgress}%)...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Choose Preset</span>
            </button>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-[11px] flex items-center gap-2">
          <span>⚠️</span>
          <span>{uploadError}</span>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Profile picture updated and saved securely to storage!</span>
        </div>
      )}

      {/* Tabs for Avatar Selection Modes */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1 border-b border-slate-800 pb-1.5 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'presets'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>📸 Real Portraits ({FEMALE_PORTRAIT_AVATARS.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('3d')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === '3d'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>🎨 Stylized & 3D ({STYLIZED_3D_AVATARS.length + ILLUSTRATED_ANIME_AVATARS.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('executive')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'executive'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>👑 Agency & Executive ({TEAM_LEADER_AVATARS.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>☁️ Dropzone</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'url'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>🔗 Direct URL</span>
          </button>
        </div>

        {/* Tab 1: Real Portraits */}
        {activeTab === 'presets' && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1 max-h-52 overflow-y-auto custom-scrollbar p-1">
              {[...FEMALE_PORTRAIT_AVATARS, ...MALE_PORTRAIT_AVATARS].map((item, idx) => {
                const isSelected = currentAvatarUrl === item.url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onAvatarChange(item.url)}
                    className={`group relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer bg-slate-950 ${
                      isSelected
                        ? `${ringColorClass} ring-2 scale-105 shadow-md`
                        : 'border-slate-800 hover:border-slate-600 hover:scale-102 opacity-80 hover:opacity-100'
                    }`}
                    title={item.label}
                  >
                    <img
                      src={item.url}
                      alt={item.label}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = fallbackUrl;
                      }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-amber-500/40 backdrop-blur-xs flex items-center justify-center">
                        <Check className="w-4 h-4 text-slate-950 font-black stroke-[3]" />
                      </div>
                    )}
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white py-0.5 text-center truncate px-1">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Stylized & 3D */}
        {activeTab === '3d' && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1 max-h-48 overflow-y-auto custom-scrollbar p-1">
            {[...STYLIZED_3D_AVATARS, ...ILLUSTRATED_ANIME_AVATARS].map((item, idx) => {
              const isSelected = currentAvatarUrl === item.url;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onAvatarChange(item.url)}
                  className={`group relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer bg-slate-950 ${
                    isSelected
                      ? `${ringColorClass} ring-2 scale-105 shadow-md`
                      : 'border-slate-800 hover:border-slate-600 hover:scale-102 opacity-80 hover:opacity-100'
                  }`}
                  title={item.label}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="w-full h-full object-cover p-0.5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = fallbackUrl;
                    }}
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-amber-500/40 backdrop-blur-xs flex items-center justify-center">
                      <Check className="w-4 h-4 text-slate-950 font-black stroke-[3]" />
                    </div>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white py-0.5 text-center truncate px-1">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 3: Agency & Executive */}
        {activeTab === 'executive' && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 max-h-48 overflow-y-auto custom-scrollbar p-1">
            {TEAM_LEADER_AVATARS.map((item, idx) => {
              const isSelected = currentAvatarUrl === item.url;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onAvatarChange(item.url)}
                  className={`group relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer bg-slate-950 ${
                    isSelected
                      ? `${ringColorClass} ring-2 scale-105 shadow-md`
                      : 'border-slate-800 hover:border-slate-600 hover:scale-102 opacity-80 hover:opacity-100'
                  }`}
                  title={item.label}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = fallbackUrl;
                    }}
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-amber-500/40 backdrop-blur-xs flex items-center justify-center">
                      <Check className="w-4 h-4 text-slate-950 font-black stroke-[3]" />
                    </div>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white py-0.5 text-center truncate px-1">
                    {item.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 4: Drag & Drop Dropzone */}
        {activeTab === 'upload' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-amber-400 bg-amber-500/10 scale-101'
                : 'border-slate-700 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-950'
            }`}
          >
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-2">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-white mb-0.5">
              Drag and drop an image photo here, or browse files
            </div>
            <p className="text-[11px] text-slate-400 font-mono mb-2">
              Supports PNG, JPG, WEBP (Max 15MB) • Instant Upload to Cloudflare R2
            </p>
            <span className="inline-block px-3 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700">
              Browse From Computer / Mobile
            </span>
          </div>
        )}

        {/* Tab 5: Direct URL */}
        {activeTab === 'url' && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 font-mono"
              />
              <button
                type="button"
                onClick={handleApplyCustomUrl}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Apply URL
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Provide any direct public HTTPS image URL to use as the profile picture.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
