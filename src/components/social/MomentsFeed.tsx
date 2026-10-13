import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Heart,
  MessageSquare,
  Video,
  Plus,
  Coins,
  Sparkles,
  X,
} from 'lucide-react';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';

interface MomentsFeedProps {
  onStartCall: (userId: string) => void;
  onOpenChat: (userId: string) => void;
  onOpenStore: () => void;
}

export const MomentsFeed: React.FC<MomentsFeedProps> = ({ onStartCall, onOpenChat, onOpenStore }) => {
  const { feedPosts, likePost, addFeedPost, tipMomentCreator, currentUser, showToast } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [tippingId, setTippingId] = useState<string | null>(null);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (publishing) return;
    if (!caption.trim() || !mediaUrl.trim()) {
      showToast('Photo Required', 'Please upload or select a photo for your moment post.', 'warning');
      return;
    }

    setPublishing(true);
    const ok = await addFeedPost({
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatarUrl,
      creatorCountry: `${currentUser.countryCode} ${currentUser.nationality}`,
      mediaType: 'image',
      mediaUrl,
      caption,
    });
    setPublishing(false);

    if (ok) {
      setCaption('');
      setMediaUrl('');
      setShowAddModal(false);
    }
  };

  const handleTipPost = async (creatorId: string, postId: string) => {
    if (tippingId) return;
    if (currentUser.role === 'male_user' && currentUser.coinBalance < 20) {
      showToast('Insufficient Coins 🪙', 'You need at least 20 coins to tip a moment.', 'error');
      onOpenStore();
      return;
    }
    setTippingId(postId);
    await tipMomentCreator(creatorId, 20, postId);
    setTippingId(null);
  };

  const handleLike = async (postId: string) => {
    if (likingId) return;
    setLikingId(postId);
    await likePost(postId);
    setLikingId(null);
  };

  return (
    <div id="moments-feed-root" className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            <span>Creators "Moments" Feed</span>
          </h2>
          <p className="text-xs text-slate-400">Discover daily stories, photos & short clips from top creators.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-2 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold text-xs rounded-xl flex items-center space-x-1 shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Post Moment</span>
        </button>
      </div>

      {/* Feed Cards */}
      <div className="space-y-6">
        {feedPosts.length === 0 ? (
          <div className="text-center py-16 px-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mx-auto text-2xl shadow-lg shadow-pink-500/10">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">No Moments Shared Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Be the first creator to share a photo or daily moment with your followers and global callers!
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs rounded-xl inline-flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Share First Moment</span>
            </button>
          </div>
        ) : (
          feedPosts.map((post) => (
          <div key={post.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-3">
            {/* Post Header */}
            <div className="p-4 flex items-center justify-between border-b border-slate-800/80">
              <div className="flex items-center space-x-3">
                <img src={post.creatorAvatar} alt={post.creatorName} className="w-10 h-10 rounded-full object-cover ring-2 ring-pink-500/50" />
                <div>
                  <h3 className="font-extrabold text-sm text-white">{post.creatorName}</h3>
                  <p className="text-[10px] text-slate-400">{post.creatorCountry} • {post.createdAt}</p>
                </div>
              </div>

              {/* 1-Tap Quick Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0 font-mono">
                <button
                  onClick={() => onOpenChat(post.creatorId)}
                  className="h-8 px-3 bg-[#161920] hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 border border-slate-700 transition-all"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Chat</span>
                </button>

                <button
                  onClick={() => onStartCall(post.creatorId)}
                  className="h-8 px-3 bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 shadow-md transition-all border border-white/20"
                >
                  <Video className="w-4 h-4 fill-current shrink-0" />
                  <span>Call</span>
                </button>
              </div>
            </div>

            {/* Media Content */}
            <div className="relative h-96 bg-slate-950 flex items-center justify-center overflow-hidden">
              <img src={post.mediaUrl} alt="Moment Media" className="w-full h-full object-cover" />
            </div>

            {/* Caption & Actions */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-200 leading-relaxed">{post.caption}</p>

              <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                <div className="flex items-center space-x-4">
                  <button
                    type="button"
                    disabled={likingId === post.id}
                    onClick={() => void handleLike(post.id)}
                    className={`flex items-center space-x-1.5 font-bold transition-colors disabled:opacity-60 ${
                      post.isLiked ? 'text-rose-500' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-current' : ''}`} />
                    <span>{post.likes}</span>
                  </button>
                </div>

                {/* Direct Tip Button */}
                {post.creatorId !== currentUser.id && (
                  <button
                    type="button"
                    disabled={tippingId === post.id}
                    onClick={() => void handleTipPost(post.creatorId, post.id)}
                    className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl font-bold text-xs flex items-center space-x-1 hover:bg-amber-500/30 transition-all disabled:opacity-60"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>{tippingId === post.id ? 'Sending…' : 'Tip 20 🪙'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )))}
      </div>

      {/* Add Moment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#12151D] border border-slate-800 p-6 rounded-3xl w-full max-w-lg space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-pink-500/20 text-pink-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Share a Moment Post</h3>
                  <p className="text-[11px] text-slate-400">Stored via R2; published through the Moments API</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreatePost(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Moment Photo</label>
                <UnifiedImageUploader
                  currentImageUrl={mediaUrl}
                  onImageUploaded={(url) => setMediaUrl(url)}
                  userId={currentUser.id}
                  category="moment"
                  aspectRatio="16:9"
                  targetRole={currentUser.role}
                  targetName={currentUser.name}
                  accentColor="pink"
                  title="Moment Photo"
                  subtitle="Upload high-res photo from your device"
                  showPresets={false}
                  showUrlInput={true}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Caption</label>
                <textarea
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="What's on your mind today? Share updates with your followers..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={publishing}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!caption.trim() || !mediaUrl.trim() || publishing}
                  className="w-1/2 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {publishing ? 'Publishing…' : 'Publish Moment ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
