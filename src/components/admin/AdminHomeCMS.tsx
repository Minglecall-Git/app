import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Image,
  FileText,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Eye,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Layers,
  Zap,
  LayoutTemplate,
} from 'lucide-react';
import { HomeBanner, PolicyDocument, HomeQuickLink } from '../../types';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { AdminDiscoveryCardDesigner } from './AdminDiscoveryCardDesigner';

type CmsSection = 'banners' | 'policies' | 'shortcuts' | 'discovery_card';

interface AdminHomeCMSProps {
  cmsSection?: CmsSection;
  onCmsSectionChange?: (section: CmsSection) => void;
  navPlacement?: 'inline' | 'sidebar';
}

export const AdminHomeCMS: React.FC<AdminHomeCMSProps> = ({
  cmsSection: cmsSectionProp,
  onCmsSectionChange,
  navPlacement = 'inline',
}) => {
  const {
    homeBanners,
    saveHomeBanner,
    deleteHomeBanner,
    toggleBannerActive,
    policyDocuments,
    savePolicyDocument,
    deletePolicyDocument,
    openPolicyModal,
    homeQuickLinks,
    saveHomeQuickLink,
    deleteHomeQuickLink,
    seedHomeCmsDefaults,
  } = useApp();

  const [cmsSectionInternal, setCmsSectionInternal] = useState<CmsSection>('banners');
  const cmsSection = cmsSectionProp ?? cmsSectionInternal;
  const setCmsSection = (section: CmsSection) => {
    onCmsSectionChange?.(section);
    if (cmsSectionProp === undefined) setCmsSectionInternal(section);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Edit / Add Banner State
  const [editingBanner, setEditingBanner] = useState<Partial<HomeBanner> | null>(null);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);

  // Edit / Add Policy State
  const [editingPolicy, setEditingPolicy] = useState<Partial<PolicyDocument> | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);

  // Edit / Add Shortcut State
  const [editingShortcut, setEditingShortcut] = useState<Partial<HomeQuickLink> | null>(null);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);

  // Preset Unsplash Dating/Social Images for Quick Pick (URL is stored in DB like any imageUrl)
  const PRESET_BANNER_IMAGES = [
    {
      label: 'Live Video Match Duo',
      url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200',
    },
    {
      label: 'Romantic Neon Lounge',
      url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=1200',
    },
    {
      label: 'VIP Gold Champagne Party',
      url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=1200',
    },
    {
      label: 'Happy Social Connection',
      url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=1200',
    },
    {
      label: 'Creator Live Streaming',
      url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=1200',
    },
  ];

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner || isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveHomeBanner(editingBanner);
      if (result.success) {
        setIsBannerModalOpen(false);
        setEditingBanner(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy || isSaving) return;
    setIsSaving(true);
    try {
      const result = await savePolicyDocument(editingPolicy);
      if (result.success) {
        setIsPolicyModalOpen(false);
        setEditingPolicy(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShortcut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShortcut || isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveHomeQuickLink(editingShortcut);
      if (result.success) {
        setIsShortcutModalOpen(false);
        setEditingShortcut(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      await seedHomeCmsDefaults();
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Section Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        <div>
          <h2 className="text-lg font-black text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-pink-400" />
            <span>Home Page CMS & Policy Manager</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Content is stored in Supabase. Changes require admin auth and show real success/failure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={isSeeding || isSaving}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 border border-slate-700 disabled:opacity-50"
            title="Write honest starter banners/policies/links into the database"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{isSeeding ? 'Seeding…' : 'Load starter content'}</span>
          </button>
          {navPlacement !== 'sidebar' && (
            <div className="flex bg-[#0B0D13] p-1 rounded-xl border border-slate-800 text-xs font-bold space-x-1">
              <button
                onClick={() => setCmsSection('banners')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  cmsSection === 'banners' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Image className="w-3.5 h-3.5" />
                <span>Hero Banners ({homeBanners.length})</span>
              </button>
              <button
                onClick={() => setCmsSection('policies')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  cmsSection === 'policies' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Policies & Terms ({policyDocuments.length})</span>
              </button>
              <button
                onClick={() => setCmsSection('shortcuts')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  cmsSection === 'shortcuts' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Quick Shortcuts ({homeQuickLinks.length})</span>
              </button>
              <button
                onClick={() => setCmsSection('discovery_card')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  cmsSection === 'discovery_card' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                <span>Discovery Card</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {cmsSection === 'discovery_card' && <AdminDiscoveryCardDesigner />}

      {/* 1. HERO BANNERS SECTION */}
      {cmsSection === 'banners' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Promo & Matchmaking Banners
            </span>
            <button
              onClick={() => {
                setEditingBanner({
                  title: '',
                  subtitle: '',
                  tagText: 'NEW PROMO',
                  tagColor: 'bg-rose-500 text-white',
                  imageUrl: PRESET_BANNER_IMAGES[0].url,
                  ctaText: 'Explore Now',
                  actionType: 'tab',
                  actionTarget: 'discovery',
                  active: true,
                  order: homeBanners.length + 1,
                  bgGradient: 'from-pink-950/90 via-rose-950/70 to-slate-900/90',
                });
                setIsBannerModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Banner</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {homeBanners.length === 0 && (
              <div className="md:col-span-2 p-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 text-center text-xs text-slate-400">
                No banners in the database yet. Add one, or click <strong className="text-white">Load starter content</strong>.
              </div>
            )}
            {homeBanners.map((banner) => (
              <div
                key={banner.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between relative group"
              >
                {/* Banner Thumbnail Preview */}
                <div className="relative h-36 w-full bg-slate-950 overflow-hidden">
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/40" />

                  <div className="absolute top-3 left-3 flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-black uppercase">
                      {banner.tagText || 'PROMO'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${banner.active ? 'bg-emerald-500/80 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {banner.active ? 'Active on Home' : 'Disabled'}
                    </span>
                  </div>

                  <div className="absolute bottom-2 left-3 right-3">
                    <h3 className="font-black text-sm text-white drop-shadow truncate">
                      {banner.title}
                    </h3>
                  </div>
                </div>

                {/* Banner Info */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-slate-300 line-clamp-2">
                    {banner.subtitle}
                  </p>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800 pt-2 font-mono">
                    <span>Target: <strong className="text-indigo-300">{banner.actionType}:{banner.actionTarget}</strong></span>
                    <span>CTA: <strong className="text-pink-300">{banner.ctaText}</strong></span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => void toggleBannerActive(banner.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                        banner.active ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                      }`}
                    >
                      {banner.active ? 'Pause' : 'Activate'}
                    </button>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => {
                          setEditingBanner({ ...banner });
                          setIsBannerModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Edit banner"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteHomeBanner(banner.id)}
                        className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 transition-colors"
                        title="Delete banner"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. POLICIES & TERMS CMS */}
      {cmsSection === 'policies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Legal, Safety & Compliance Documents
            </span>
            <button
              onClick={() => {
                setEditingPolicy({
                  title: '',
                  slug: 'new-policy',
                  category: 'safety',
                  icon: 'ShieldCheck',
                  summary: '',
                  content: '### Section 1: Overview\nProvide detailed community or legal guidelines here.\n\n* Compliance point 1\n* Compliance point 2',
                  isFeaturedOnHome: true,
                });
                setIsPolicyModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Policy</span>
            </button>
          </div>

          <div className="space-y-3">
            {policyDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md hover:border-slate-700 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 text-[10px] font-mono uppercase font-bold border border-indigo-800/60">
                      {doc.category}
                    </span>
                    <h3 className="font-extrabold text-sm text-white">{doc.title}</h3>
                    {doc.isFeaturedOnHome && (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded">
                        Featured on Home
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                    {doc.summary}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => openPolicyModal(doc.id)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Preview</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingPolicy({ ...doc });
                      setIsPolicyModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => void deletePolicyDocument(doc.id)}
                    className="p-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 transition-colors"
                    title="Delete policy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. QUICK SHORTCUTS CMS */}
      {cmsSection === 'shortcuts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Home Grid Shortcuts
            </span>
            <button
              onClick={() => {
                setEditingShortcut({
                  title: '',
                  subtitle: '',
                  icon: 'Zap',
                  badge: 'NEW',
                  actionType: 'tab',
                  actionTarget: 'discovery',
                  colorGradient: 'from-pink-600 to-rose-600',
                  active: true,
                  order: homeQuickLinks.length + 1,
                });
                setIsShortcutModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Shortcut</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {homeQuickLinks.map((link) => (
              <div
                key={link.id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.colorGradient} flex items-center justify-center text-white font-bold shadow`}>
                    {link.icon === 'Zap' ? <Zap className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-xs text-white">{link.title}</span>
                      {link.badge && (
                        <span className="px-1.5 py-0.2 rounded bg-pink-600 text-white text-[8px] font-black uppercase">
                          {link.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Target: {link.actionTarget}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      setEditingShortcut({ ...link });
                      setIsShortcutModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void deleteHomeQuickLink(link.id)}
                    className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BANNER EDIT MODAL */}
      {isBannerModalOpen && editingBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-black text-white text-base">
                {editingBanner.id ? 'Edit Hero Promo Banner' : 'Create New Hero Banner'}
              </h3>
              <button
                onClick={() => setIsBannerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Headline Title</label>
                <input
                  type="text"
                  required
                  value={editingBanner.title || ''}
                  onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                  placeholder="e.g. VIP Video Speed Match"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Subtitle / Description</label>
                <textarea
                  rows={2}
                  required
                  value={editingBanner.subtitle || ''}
                  onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })}
                  placeholder="e.g. Connect 1-on-1 with live verified creators with instant speech translation."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tag Badge Text</label>
                  <input
                    type="text"
                    value={editingBanner.tagText || ''}
                    onChange={(e) => setEditingBanner({ ...editingBanner, tagText: e.target.value })}
                    placeholder="e.g. HOT, VIP, LIVE NOW"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">CTA Button Text</label>
                  <input
                    type="text"
                    value={editingBanner.ctaText || 'Explore Now'}
                    onChange={(e) => setEditingBanner({ ...editingBanner, ctaText: e.target.value })}
                    placeholder="e.g. Spin Roulette"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Tag Color Classes</label>
                <input
                  type="text"
                  value={editingBanner.tagColor || 'bg-rose-500 text-white'}
                  onChange={(e) => setEditingBanner({ ...editingBanner, tagColor: e.target.value })}
                  placeholder="e.g. bg-rose-500 text-white"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-2">Banner Image</label>
                <UnifiedImageUploader
                  currentImageUrl={editingBanner.imageUrl || ''}
                  onImageUploaded={(url) => setEditingBanner({ ...editingBanner, imageUrl: url })}
                  category="moment"
                  aspectRatio="16:9"
                  accentColor="pink"
                  title="Banner Image"
                  subtitle="Upload 16:9 promotional banner or choose from curated presets"
                  showPresets={false}
                  showUrlInput={true}
                />
                
                {/* Preset image picker */}
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] text-slate-400">Or pick from HD banner presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_BANNER_IMAGES.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingBanner({ ...editingBanner, imageUrl: preset.url })}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] text-slate-300 hover:text-white cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Action Type</label>
                  <select
                    value={editingBanner.actionType || 'tab'}
                    onChange={(e) => setEditingBanner({ ...editingBanner, actionType: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                  >
                    <option value="tab">Navigate to Tab</option>
                    <option value="modal">Open Modal (match, store)</option>
                    <option value="policy">Open Policy Doc</option>
                    <option value="external">External Link</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Action Target</label>
                  <input
                    type="text"
                    value={editingBanner.actionTarget || 'discovery'}
                    onChange={(e) => setEditingBanner({ ...editingBanner, actionTarget: e.target.value })}
                    placeholder="e.g. discovery, match, store, policy_safety"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="banner-active-check"
                  checked={editingBanner.active ?? true}
                  onChange={(e) => setEditingBanner({ ...editingBanner, active: e.target.checked })}
                  className="rounded border-slate-700 text-pink-600 focus:ring-pink-500 w-4 h-4"
                />
                <label htmlFor="banner-active-check" className="text-slate-300 font-bold cursor-pointer">
                  Display this banner actively on the Home page
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black shadow-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POLICY EDIT MODAL */}
      {isPolicyModalOpen && editingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-black text-white text-base">
                {editingPolicy.id ? 'Edit Legal & Safety Policy' : 'Create New Policy Document'}
              </h3>
              <button
                onClick={() => setIsPolicyModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePolicy} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Policy Title</label>
                  <input
                    type="text"
                    required
                    value={editingPolicy.title || ''}
                    onChange={(e) => setEditingPolicy({ ...editingPolicy, title: e.target.value })}
                    placeholder="e.g. Terms of Service & 18+ Verification"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Category</label>
                  <select
                    value={editingPolicy.category || 'safety'}
                    onChange={(e) => setEditingPolicy({ ...editingPolicy, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                  >
                    <option value="safety">Safety & Moderation</option>
                    <option value="privacy">Privacy & Encryption</option>
                    <option value="terms">Terms of Service</option>
                    <option value="coins">Coin & Refund Rules</option>
                    <option value="creators">Creator Monetization</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Summary (Short description)</label>
                <input
                  type="text"
                  required
                  value={editingPolicy.summary || ''}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, summary: e.target.value })}
                  placeholder="One sentence summary shown on policy cards"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Policy Content (Supports Markdown ### Headers and - Bullet points)
                </label>
                <textarea
                  rows={8}
                  required
                  value={editingPolicy.content || ''}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, content: e.target.value })}
                  placeholder="### 1. Requirements&#10;- Bullet point 1&#10;- Bullet point 2"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs focus:border-pink-500 focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">External Legal Document URL (Optional)</label>
                <input
                  type="text"
                  value={editingPolicy.externalUrl || ''}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, externalUrl: e.target.value })}
                  placeholder="https://yourdomain.com/legal/terms.pdf"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="policy-featured-check"
                  checked={editingPolicy.isFeaturedOnHome ?? true}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, isFeaturedOnHome: e.target.checked })}
                  className="rounded border-slate-700 text-pink-600 focus:ring-pink-500 w-4 h-4"
                />
                <label htmlFor="policy-featured-check" className="text-slate-300 font-bold cursor-pointer">
                  Feature prominently on Home page Trust & Policies grid
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black shadow-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHORTCUT EDIT MODAL */}
      {isShortcutModalOpen && editingShortcut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-black text-white text-base">
                {editingShortcut.id ? 'Edit Shortcut' : 'Create Shortcut'}
              </h3>
              <button
                onClick={() => setIsShortcutModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShortcut} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Shortcut Title</label>
                <input
                  type="text"
                  required
                  value={editingShortcut.title || ''}
                  onChange={(e) => setEditingShortcut({ ...editingShortcut, title: e.target.value })}
                  placeholder="e.g. VIP Club"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Subtitle</label>
                <input
                  type="text"
                  value={editingShortcut.subtitle || ''}
                  onChange={(e) => setEditingShortcut({ ...editingShortcut, subtitle: e.target.value })}
                  placeholder="e.g. 50% Off Calls"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Badge Tag</label>
                  <input
                    type="text"
                    value={editingShortcut.badge || ''}
                    onChange={(e) => setEditingShortcut({ ...editingShortcut, badge: e.target.value })}
                    placeholder="e.g. HOT, VIP, 50% OFF"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Action Target</label>
                  <input
                    type="text"
                    value={editingShortcut.actionTarget || 'discovery'}
                    onChange={(e) => setEditingShortcut({ ...editingShortcut, actionTarget: e.target.value })}
                    placeholder="e.g. discovery, match, store"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsShortcutModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black shadow-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save Shortcut'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
