import React, { useState } from 'react';
import { Star, X, Sparkles, MessageSquare, ShieldCheck, Heart, ThumbsUp, Video, Clock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';

interface PostCallRatingModalProps {
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  callLogId?: string;
  durationSeconds?: number;
  ratingRequestMessageId?: string;
  onClose: () => void;
}

const QUICK_TAGS = [
  'Super Friendly 😊',
  'Great Energy ⚡',
  'Awesome Conversation 💬',
  'HD Quality 📹',
  'Fun Time 🎉',
  'Very Attentive 💖',
  'Hilarious 😂',
];

const STAR_LABELS: Record<number, string> = {
  1: 'Disappointing 😕',
  2: 'Fair 😐',
  3: 'Good 🙂',
  4: 'Great! 😊',
  5: 'Exceptional! 🌟',
};

export const PostCallRatingModal: React.FC<PostCallRatingModalProps> = ({
  creatorId,
  creatorName,
  creatorAvatar,
  callLogId,
  durationSeconds = 60,
  ratingRequestMessageId,
  onClose,
}) => {
  const { currentUser, submitCreatorReview } = useApp();
  const [stars, setStars] = useState(5);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [communication, setCommunication] = useState(5);
  const [friendliness, setFriendliness] = useState(5);
  const [clarity, setClarity] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Super Friendly 😊', 'Great Energy ⚡']);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const ok = await submitCreatorReview({
      creatorId,
      creatorName,
      creatorAvatar,
      callerId: currentUser.id,
      callerName: currentUser.name,
      callerAvatar: currentUser.avatarUrl,
      callerCountry: currentUser.nationality,
      callLogId,
      ratingRequestMessageId,
      stars: stars || 5,
      communication,
      friendliness,
      clarity,
      energy,
      comment: comment.trim() || undefined,
      tags: selectedTags,
      callDurationSeconds: durationSeconds,
    });

    setIsSubmitting(false);
    if (ok) onClose();
  };

  const activeStarCount = hoveredStar !== null ? hoveredStar : stars;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#11141C] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] text-slate-200">
        
        {/* Glow ambient background behind modal */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between relative z-10 bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-yellow-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md">
              <Star className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider font-mono">
                Rate This Session
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Rating requested by {creatorName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-800"
            title="Skip for now"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 relative z-10 flex-1">
          
          {/* Creator Profile Card with Call Recap */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={normalizeMediaUrl(creatorAvatar)}
                  alt={creatorName}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getFallbackAvatar(creatorName, 'female');
                  }}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-pink-500/50 shadow-md bg-slate-900"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-[8px] text-slate-950 font-black">
                  ✓
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-extrabold text-white truncate flex items-center space-x-1.5">
                  <span>{creatorName}</span>
                  <span className="text-[10px] text-pink-400 font-mono font-bold bg-pink-500/10 px-1.5 py-0.2 rounded border border-pink-500/20">
                    Host
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center space-x-2">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{Math.max(1, Math.round(durationSeconds / 60))} min session</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                Feedback requested
              </span>
            </div>
          </div>

          {/* Primary 5-Star Rating Picker */}
          <div className="text-center space-y-2.5 py-1">
            <label className="text-xs font-black uppercase font-mono tracking-wider text-slate-300">
              Overall Experience Rating
            </label>
            <div className="flex items-center justify-center space-x-2 sm:space-x-3">
              {[1, 2, 3, 4, 5].map((starIdx) => {
                const isLit = starIdx <= activeStarCount;
                return (
                  <button
                    key={starIdx}
                    type="button"
                    onMouseEnter={() => setHoveredStar(starIdx)}
                    onMouseLeave={() => setHoveredStar(null)}
                    onClick={() => setStars(starIdx)}
                    className="p-1 sm:p-2 transform transition-all duration-150 hover:scale-125 focus:outline-none cursor-pointer"
                  >
                    <Star
                      className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                        isLit
                          ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]'
                          : 'text-slate-700 hover:text-slate-500'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <div className="text-xs font-mono font-bold text-yellow-400 animate-in fade-in">
              {STAR_LABELS[activeStarCount] || 'Select Rating'}
            </div>
          </div>

          {/* Detailed Category Dimensions */}
          <div className="space-y-2.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <div className="text-[11px] font-black uppercase font-mono tracking-wider text-slate-400 flex items-center justify-between">
              <span>Category Breakdown</span>
              <span className="text-yellow-400/80 font-normal">Tap stars to refine</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              {/* Communication */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-300">🗣️ Communication</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCommunication(s)}
                      className="cursor-pointer"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          s <= communication ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Friendliness */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-300">😊 Friendliness</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFriendliness(s)}
                      className="cursor-pointer"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          s <= friendliness ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Clarity */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-300">📹 HD Video/Audio</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setClarity(s)}
                      className="cursor-pointer"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          s <= clarity ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-300">⚡ Energy & Vibe</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEnergy(s)}
                      className="cursor-pointer"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          s <= energy ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Compliment Tags */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase font-mono tracking-wider text-slate-400 block">
              Add Compliment Badges
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-pink-500/20 border-pink-500 text-pink-300 shadow-sm shadow-pink-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Review Text Area */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase font-mono tracking-wider text-slate-400 flex items-center justify-between">
              <span>Feedback & Compliments (Optional)</span>
              <span className="text-slate-500 font-normal">Max 250 chars</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={250}
              placeholder={`Write a nice review for ${creatorName}... (e.g. Great conversation and very sweet!)`}
              rows={2}
              className="w-full bg-[#0A0C10] border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 font-mono resize-none transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs font-mono font-bold transition-all cursor-pointer"
            >
              Skip
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-500 to-pink-600 hover:from-yellow-400 hover:to-pink-500 text-slate-950 font-black text-xs font-mono tracking-wide shadow-lg shadow-yellow-500/25 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Star className="w-4 h-4 fill-slate-950" />
              <span>Submit Rating ⭐</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
