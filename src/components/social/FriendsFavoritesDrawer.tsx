import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserProfile } from '../../types';
import {
  X,
  Star,
  Users,
  Video,
  MessageCircle,
  ShieldAlert,
  Search,
  CheckCircle2,
  Trash2,
  UserPlus,
  Check,
  Clock,
  UserMinus,
  Sparkles,
  Unlock,
  Shield,
} from 'lucide-react';
import { getCountryFlag } from '../../utils/flags';

interface FriendsFavoritesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChat: (userId: string) => void;
  onBlockUserModal?: (userId: string) => void;
  onStartCall?: (userId: string) => void;
}

export const FriendsFavoritesDrawer: React.FC<FriendsFavoritesDrawerProps> = ({
  isOpen,
  onClose,
  onOpenChat,
  onBlockUserModal,
}) => {
  const {
    users,
    currentUser,
    favorites,
    friends,
    isFriend,
    friendRequests,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    toggleFavorite,
    startCall,
    blockedUserIds,
    unblockUser,
    systemSettings,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'favorites' | 'blocked'>('friends');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  // Filter friends, requests, favorites, blocked
  const friendUsers = users.filter((u) => isFriend(u.id) && !blockedUserIds.includes(u.id));
  const favoriteUsers = users.filter((u) => favorites.includes(u.id) && !blockedUserIds.includes(u.id));
  const blockedUsers = users.filter((u) => blockedUserIds.includes(u.id));

  // Pending incoming requests for current user (filtered to exclude blocked users)
  const incomingRequests = friendRequests.filter(
    (r) => r.receiverId === currentUser.id && r.status === 'pending' && !blockedUserIds.includes(r.senderId)
  );

  const filteredFriends = friendUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nationality.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFavorites = favoriteUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nationality.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/80 backdrop-blur-md cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md h-full bg-[#161920] border-l border-slate-800 shadow-2xl flex flex-col cursor-default pb-16 md:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 bg-[#0F1115] border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              Friends & Social Hub
            </h2>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Switcher */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-[#0F1115]/50 text-[11px] font-mono">
          <button
            onClick={() => setActiveTab('friends')}
            className={`py-3 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'friends'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Friends ({friendUsers.length})
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 text-center font-bold border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'requests'
                ? 'border-pink-500 text-pink-400 bg-pink-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Requests
            {incomingRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-pink-500 text-white rounded-full text-[9px] font-mono animate-pulse">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`py-3 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'favorites'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Saved ({favoriteUsers.length})
          </button>

          <button
            onClick={() => setActiveTab('blocked')}
            className={`py-3 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'blocked'
                ? 'border-rose-500 text-rose-400 bg-rose-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Blocked ({blockedUsers.length})
          </button>
        </div>

        {/* Search */}
        {activeTab !== 'requests' && activeTab !== 'blocked' && (
          <div className="p-3 bg-[#0F1115]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search name or country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1A1D26] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* TAB 1: FRIENDS */}
          {activeTab === 'friends' && (
            filteredFriends.length === 0 ? (
              <div className="text-center py-16 text-slate-500 font-mono text-xs space-y-2">
                <Users className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-bold">No Friends Added Yet</p>
                <p className="text-[10px] max-w-xs mx-auto text-slate-400">
                  When females send you a friend request and you accept, your friends list updates here! Friends enjoy discounted call rates ({systemSettings.coinBurnRateFriendPerMin} 🪙/min).
                </p>
              </div>
            ) : (
              filteredFriends.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#0F1115] border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-3 flex items-center justify-between transition-all shadow-md"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-emerald-500/40"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs flex items-center space-x-1 truncate">
                        <span>{user.name}</span>
                        {user.isVerified && <span className="text-blue-400 text-xs shrink-0">✓</span>}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Friend Rate ({systemSettings.coinBurnRateFriendPerMin} 🪙/min)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenChat(user.id);
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
                      title="Open Direct Chat"
                    >
                      <MessageCircle className="w-4 h-4 text-indigo-400" />
                    </button>

                    <button
                      onClick={() => {
                        onClose();
                        startCall(user.id);
                      }}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition-colors cursor-pointer"
                      title="Start Call"
                    >
                      <Video className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => removeFriend(user.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      title="Remove Friend"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB 2: INCOMING FRIEND REQUESTS */}
          {activeTab === 'requests' && (
            incomingRequests.length === 0 ? (
              <div className="text-center py-16 text-slate-500 font-mono text-xs space-y-2">
                <UserPlus className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-bold">No Pending Friend Requests</p>
                <p className="text-[10px] max-w-xs mx-auto text-slate-400">
                  When female creators send you a friend request after a call, they will appear here for one-click approval!
                </p>
              </div>
            ) : (
              incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-gradient-to-br from-pink-950/60 to-slate-900 border border-pink-500/30 rounded-2xl p-4 space-y-3 shadow-xl"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={req.senderAvatar}
                      alt={req.senderName}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-pink-500/50"
                    />
                    <div>
                      <h4 className="text-sm font-extrabold text-white">{req.senderName}</h4>
                      <p className="text-[11px] text-pink-300 font-medium">Sent you a Friend Request 🌸</p>
                      <span className="text-[9px] text-slate-400 font-mono">{req.timestamp}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-950/80 rounded-xl text-[10px] text-emerald-300 font-bold flex items-center justify-between">
                    <span>Friend Call Rate:</span>
                    <span className="text-emerald-400">{systemSettings.coinBurnRateFriendPerMin ?? 80} 🪙/min</span>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => acceptFriendRequest(req.id)}
                      className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <Check className="w-4 h-4 text-emerald-100" />
                      <span>Accept Request</span>
                    </button>
                    <button
                      onClick={() => declineFriendRequest(req.id)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB 3: FAVORITES */}
          {activeTab === 'favorites' && (
            filteredFavorites.length === 0 ? (
              <div className="text-center py-16 text-slate-500 font-mono text-xs space-y-2">
                <Star className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-bold">No Saved Favorites</p>
              </div>
            ) : (
              filteredFavorites.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#0F1115] border border-slate-800 rounded-2xl p-3 flex items-center justify-between shadow-md"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate">{user.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{user.nationality}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenChat(user.id);
                      }}
                      className="p-2 bg-slate-800 text-indigo-400 rounded-xl"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleFavorite(user.id)}
                      className="p-2 text-amber-400 hover:text-slate-400"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB 4: BLOCKED */}
          {activeTab === 'blocked' && (
            blockedUsers.length === 0 ? (
              <div className="text-center py-16 text-slate-500 font-mono text-xs space-y-2">
                <Shield className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-bold">No Blocked Users</p>
                <p className="text-[10px] text-slate-500">Users you block will appear here with instant unblock controls.</p>
              </div>
            ) : (
              blockedUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#0F1115] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover grayscale ring-1 ring-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-white text-xs truncate">{user.name}</span>
                        <span className="text-xs shrink-0" title={user.nationality}>
                          {getCountryFlag(user.countryCode, user.nationality)}
                        </span>
                      </div>
                      <div className="text-[10px] text-rose-400/90 font-mono font-semibold flex items-center space-x-1 mt-0.5">
                        <span>● Blocked from contacting</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => unblockUser(user.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/40 text-xs font-mono font-bold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 shadow-sm"
                    title={`Unblock ${user.name}`}
                  >
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unblock</span>
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};
