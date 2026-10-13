import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Loader2,
  Check,
  Sparkles,
  Link as LinkIcon,
  AlertCircle,
  Cloud,
  CheckCircle2,
} from 'lucide-react';
import {
  uploadMediaDirectlyToR2,
  normalizeMediaUrl,
  isPersistableMediaUrl,
  snapshotFilesForUpload,
} from '../../utils/r2Storage';
import {
  FEMALE_PORTRAIT_AVATARS,
  MALE_PORTRAIT_AVATARS,
  TEAM_LEADER_AVATARS,
  STYLIZED_3D_AVATARS,
  ILLUSTRATED_ANIME_AVATARS,
  getFallbackAvatar,
} from '../../utils/avatars';
import { UserRole } from '../../types';

/** Matches server CATEGORY_MAX_BYTES for gallery/moment/avatar images. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface UnifiedImageUploaderProps {
  currentImageUrl?: string;
  onImageUploaded: (publicUrl: string, storageKey?: string) => void;
  /** When multiple is true, called once with all durable URLs after the batch finishes. */
  onImagesUploaded?: (
    items: { publicUrl: string; storageKey?: string; localPreviewUrl?: string }[]
  ) => void;
  userId?: string;
  category?: 'avatar' | 'gallery' | 'chat_media' | 'moment' | 'verification';
  aspectRatio?: '1:1' | '4:5' | '16:9' | 'auto';
  targetRole?: UserRole | string;
  targetName?: string;
  accentColor?: 'pink' | 'indigo' | 'amber' | 'emerald';
  title?: string;
  subtitle?: string;
  showPresets?: boolean;
  showUrlInput?: boolean;
  compact?: boolean;
  onCancel?: () => void;
  /** Allow selecting multiple images (gallery). */
  multiple?: boolean;
}

export const UnifiedImageUploader: React.FC<UnifiedImageUploaderProps> = ({
  currentImageUrl,
  onImageUploaded,
  onImagesUploaded,
  userId = 'current_user',
  category = 'avatar',
  targetRole = 'female_creator',
  targetName = 'User',
  accentColor = 'pink',
  subtitle = 'Supported formats: PNG, JPG, WEBP, GIF (Max 10MB)',
  showPresets = true,
  showUrlInput = true,
  multiple = false,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'presets' | 'url'>('upload');
  const [presetCategory, setPresetCategory] = useState<'role_based' | '3d' | 'anime'>('role_based');
  const [previewUrl, setPreviewUrl] = useState<string>(normalizeMediaUrl(currentImageUrl) || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobPreviewRef = useRef<string | null>(null);

  const revokeBlobPreview = () => {
    if (blobPreviewRef.current) {
      try {
        URL.revokeObjectURL(blobPreviewRef.current);
      } catch {
        /* ignore */
      }
      blobPreviewRef.current = null;
    }
  };

  useEffect(() => {
    if (currentImageUrl && !previewUrl) {
      setPreviewUrl(normalizeMediaUrl(currentImageUrl));
    }
  }, [currentImageUrl]);

  useEffect(() => {
    return () => {
      revokeBlobPreview();
    };
  }, []);

  const uploadOneFile = async (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ publicUrl: string; storageKey?: string }> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select a valid image file (PNG, JPG, WEBP, GIF).');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('Image file is too large. Max size is 10MB.');
    }
    const result = await uploadMediaDirectlyToR2({
      file,
      userId,
      category,
      onProgress,
    });
    if (!result?.publicUrl || !isPersistableMediaUrl(result.publicUrl)) {
      throw new Error('Upload completed but no cloud storage URL was returned');
    }
    return { publicUrl: result.publicUrl, storageKey: result.storageKey };
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    setErrorMessage(null);
    setUploadSuccess(false);
    revokeBlobPreview();

    const objectUrl = URL.createObjectURL(file);
    blobPreviewRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setIsUploading(true);
    setUploadProgress(15);

    try {
      const uploaded = await uploadOneFile(file, (percent) => {
        setUploadProgress(Math.max(15, percent));
      });
      // Prefer durable URL for preview so refresh/reload matches what was saved
      revokeBlobPreview();
      setPreviewUrl(normalizeMediaUrl(uploaded.publicUrl, uploaded.storageKey) || uploaded.publicUrl);
      setUploadSuccess(true);
      onImageUploaded(uploaded.publicUrl, uploaded.storageKey);
    } catch (err: any) {
      console.error('[Unified Uploader] Cloud upload failed:', err?.message || err);
      revokeBlobPreview();
      setPreviewUrl(normalizeMediaUrl(currentImageUrl) || '');
      setErrorMessage(err?.message || 'Failed to upload image to Cloudflare R2. Please try again.');
      setUploadSuccess(false);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFilesSelect = async (files: FileList | File[]) => {
    // Snapshot immediately — FileList handles go stale after the first await on many devices.
    const list = await snapshotFilesForUpload(files);
    if (!list.length) return;
    if (!multiple || list.length === 1) {
      await handleFileSelect(list[0]);
      return;
    }

    setErrorMessage(null);
    setUploadSuccess(false);
    revokeBlobPreview();
    setIsUploading(true);
    setUploadProgress(5);

    const uploaded: { publicUrl: string; storageKey?: string; localPreviewUrl?: string }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(file);
        blobPreviewRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        const item = await uploadOneFile(file, (percent) => {
          const overall = Math.round(((i + percent / 100) / list.length) * 100);
          setUploadProgress(Math.max(5, overall));
        });
        // Keep per-item blob for the parent gallery grid; do not revoke here.
        blobPreviewRef.current = null;
        uploaded.push({ ...item, localPreviewUrl: objectUrl });
        setPreviewUrl(normalizeMediaUrl(item.publicUrl, item.storageKey) || item.publicUrl || objectUrl);
      } catch (err: any) {
        errors.push(`${file.name}: ${err?.message || 'upload failed'}`);
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            /* ignore */
          }
        }
        blobPreviewRef.current = null;
      }
    }

    setIsUploading(false);
    setUploadProgress(0);

    if (uploaded.length > 0) {
      setUploadSuccess(true);
      if (onImagesUploaded) {
        onImagesUploaded(uploaded);
      } else {
        for (const item of uploaded) {
          onImageUploaded(item.publicUrl, item.storageKey);
        }
      }
    } else {
      setPreviewUrl(normalizeMediaUrl(currentImageUrl) || '');
      setUploadSuccess(false);
    }
    if (errors.length) {
      setErrorMessage(
        uploaded.length
          ? `${uploaded.length} uploaded; ${errors.length} failed. ${errors[0]}`
          : errors[0] || 'Failed to upload images.'
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) {
      void handleFilesSelect(files);
    }
  };

  const handleApplyCustomUrl = () => {
    if (!customUrlInput.trim()) return;
    setPreviewUrl(customUrlInput.trim());
    onImageUploaded(customUrlInput.trim());
    setCustomUrlInput('');
    setUploadSuccess(true);
  };

  const colorStyles = {
    pink: {
      border: 'border-pink-500/50',
      ring: 'ring-pink-500',
      bg: 'bg-pink-500/10 text-pink-300',
      button: 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white',
      accentText: 'text-pink-400',
    },
    indigo: {
      border: 'border-indigo-500/50',
      ring: 'ring-indigo-500',
      bg: 'bg-indigo-500/10 text-indigo-300',
      button: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      accentText: 'text-indigo-400',
    },
    amber: {
      border: 'border-amber-500/50',
      ring: 'ring-amber-400',
      bg: 'bg-amber-500/10 text-amber-300',
      button: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold',
      accentText: 'text-amber-400',
    },
    emerald: {
      border: 'border-emerald-500/50',
      ring: 'ring-emerald-400',
      bg: 'bg-emerald-500/10 text-emerald-300',
      button: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      accentText: 'text-emerald-400',
    },
  }[accentColor];

  // Pick presets list based on selected sub-category
  const currentPresetsList =
    presetCategory === '3d'
      ? STYLIZED_3D_AVATARS
      : presetCategory === 'anime'
      ? ILLUSTRATED_ANIME_AVATARS
      : targetRole === 'male_user'
      ? MALE_PORTRAIT_AVATARS
      : targetRole === 'team_leader'
      ? TEAM_LEADER_AVATARS
      : FEMALE_PORTRAIT_AVATARS;

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.length) void handleFilesSelect(e.target.files);
          e.target.value = '';
        }}
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        multiple={multiple}
        className="hidden"
      />

      {/* Tabs Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-1.5 font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'upload'
                ? `${colorStyles.bg} border ${colorStyles.border}`
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>

          {showPresets && (
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'presets'
                  ? `${colorStyles.bg} border ${colorStyles.border}`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Presets Gallery</span>
            </button>
          )}

          {showUrlInput && (
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'url'
                  ? `${colorStyles.bg} border ${colorStyles.border}`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Image URL</span>
            </button>
          )}
        </div>

        <span className="text-[10px] font-mono text-cyan-400 flex items-center space-x-1">
          <Cloud className="w-3 h-3" />
          <span>R2 Storage</span>
        </span>
      </div>

      {/* Tab 1: Upload File & Dropzone */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-pink-500 bg-pink-500/10 scale-[1.01]'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-900/60'
            }`}
          >
            <div className={`w-12 h-12 rounded-2xl ${colorStyles.bg} flex items-center justify-center mb-2 shadow-inner`}>
              <UploadCloud className="w-6 h-6" />
            </div>
            <h4 className="text-white font-bold text-sm">
              Drag and drop your photo{multiple ? 's' : ''} here, or{' '}
              <span className={colorStyles.accentText}>browse files</span>
            </h4>
            <p className="text-slate-400 text-[11px] mt-1">{subtitle}</p>
          </div>
        </div>
      )}

      {/* Tab 2: Curated Presets with Sub-Categories */}
      {activeTab === 'presets' && showPresets && (
        <div className="space-y-3">
          {/* Preset Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setPresetCategory('role_based')}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                presetCategory === 'role_based'
                  ? `${colorStyles.bg} border ${colorStyles.border}`
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              👑 Realistic Portraits
            </button>
            <button
              type="button"
              onClick={() => setPresetCategory('3d')}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                presetCategory === '3d'
                  ? `${colorStyles.bg} border ${colorStyles.border}`
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              🎨 3D Personas
            </button>
            <button
              type="button"
              onClick={() => setPresetCategory('anime')}
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                presetCategory === 'anime'
                  ? `${colorStyles.bg} border ${colorStyles.border}`
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              ✨ Illustrated Anime
            </button>
          </div>

          {/* Grid of Avatars */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-52 overflow-y-auto p-1 bg-slate-950/60 rounded-2xl border border-slate-800/80">
            {currentPresetsList.map((item, i) => {
              const url = typeof item === 'string' ? item : item.url;
              const label = typeof item === 'string' ? `Preset ${i + 1}` : item.label;
              const isSelected = previewUrl === url;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPreviewUrl(url);
                    onImageUploaded(url);
                    setUploadSuccess(true);
                  }}
                  className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer hover:scale-105 bg-slate-900 ${
                    isSelected ? `${colorStyles.border} ring-2 ${colorStyles.ring}` : 'border-slate-800 hover:border-slate-600'
                  }`}
                  title={label}
                >
                  <img
                    src={url}
                    alt={label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getFallbackAvatar(label, 'female');
                    }}
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 p-0.5 text-[8px] text-white font-mono truncate text-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Custom URL Input */}
      {activeTab === 'url' && showUrlInput && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleApplyCustomUrl}
              className={`px-3 py-2 rounded-xl font-bold font-mono transition-all cursor-pointer ${colorStyles.button}`}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Real-time Upload Progress Bar */}
      {isUploading && (
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400">
            <span className="flex items-center space-x-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Uploading to Cloudflare R2 Bucket...</span>
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Preview Card */}
      {previewUrl && (
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={previewUrl}
                alt="Upload Preview"
                className={`w-14 h-14 object-cover ring-2 ${colorStyles.ring} shadow-md rounded-2xl bg-slate-900`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getFallbackAvatar(targetName, 'female');
                }}
              />
              {uploadSuccess && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-slate-950 flex items-center justify-center text-[10px] font-bold shadow">
                  ✓
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-white font-bold text-xs truncate flex items-center space-x-1.5">
                <span>Active Image Preview</span>
                {uploadSuccess && (
                  <span className="text-[10px] text-emerald-400 font-mono flex items-center space-x-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Selected & Synced</span>
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[10px] font-mono truncate max-w-xs pt-0.5">{previewUrl}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer shrink-0"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
};
