import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Upload,
  ArrowRight,
  ArrowLeft,
  X,
  FileText,
  Check,
  Video,
  Loader2,
} from 'lucide-react';
import { UserProfile, OnboardingFormData, getUserRoleLabel, getFemaleRoleMark } from '../../types';
import { completeUserProfileOnboarding } from '../../services/supabaseAuthService';
import { uploadMediaDirectlyToR2 } from '../../utils/r2Storage';
import { getAllowedCountries, findCountryByCodeOrName, CountryItem } from '../../utils/countries';
import { useApp } from '../../context/AppContext';
import { DatePicker } from '../common/DatePicker';
import { UnifiedImageUploader } from '../common/UnifiedImageUploader';
import { CountrySelector } from '../common/CountrySelector';
import { LanguageSelector } from '../common/LanguageSelector';
import { ZodiacSelector } from '../common/ZodiacSelector';
import { InterestSelector } from '../common/InterestSelector';
import { getAccessToken } from '../../utils/apiClient';
import { isSupabaseConfigured } from '../../lib/supabase';

interface OnboardingWizardProps {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
  onCancel?: () => void;
}

const FALLBACK_FEMALE_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400';
const FALLBACK_MALE_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400';

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  user,
  onComplete,
  onCancel,
}) => {
  const { systemSettings, updateUserProfile, showToast } = useApp();
  const isFemaleHost = user.role === 'female_creator' || user.role === 'female_host';
  const lockedGender =
    user.gender ||
    (isFemaleHost || user.role === 'female_user'
      ? 'female'
      : user.role === 'other_user'
        ? 'other'
        : 'male');

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Allowed worldwide countries list derived from Admin Dashboard settings
  const allowedCountries = useMemo(() => {
    return getAllowedCountries(systemSettings.allowedCountryCodes);
  }, [systemSettings.allowedCountryCodes]);

  // Initial country matching
  const initialCountry = useMemo(() => {
    const matched = findCountryByCodeOrName(user.countryCode || user.nationality || 'US');
    return matched || allowedCountries[0] || { name: 'United States', code: 'US', flag: '🇺🇸', region: 'North America' };
  }, [user.countryCode, user.nationality, allowedCountries]);

  // Form State — gender locked from account role; terms must be explicitly accepted
  const [formData, setFormData] = useState<OnboardingFormData>({
    dob: user.dob || '2000-01-01',
    age: user.age || 24,
    gender: lockedGender,
    nationality: user.nationality || initialCountry.name,
    countryCode: user.countryCode || initialCountry.code,
    zodiac: user.zodiac || '',
    spokenLanguages: user.spokenLanguages.length > 0 ? user.spokenLanguages : ['English'],
    bio: user.bio || '',
    interests: user.interests.length > 0 ? user.interests : [],
    interestedIn: user.interestedIn && user.interestedIn.length > 0 
      ? user.interestedIn 
      : ((user.gender === 'female' || isFemaleHost || user.role === 'female_user' || user.role === 'female_creator') ? ['male'] : ['female']),
    tags: user.tags && user.tags.length > 0 ? user.tags : [],
    hourlyCoinRate: user.hourlyCoinRate || (isFemaleHost ? 10 : 0),
    avatarUrl: user.avatarUrl || (isFemaleHost ? FALLBACK_FEMALE_AVATAR : FALLBACK_MALE_AVATAR),
    gallery: user.gallery.length > 0 ? user.gallery : [],
    introVideoUrl: user.introVideoUrl || undefined,
    agreedToTerms: false,
    agreedToAdultTerms: false,
    agreedToHostTerms: false,
  });

  // Local image preview states to guarantee immediate feedback and avoid broken icons
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null);
  const [localGalleryPreviews, setLocalGalleryPreviews] = useState<string[]>([]);

  // Country dropdown UI state
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Validation & Loading States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered countries for dropdown
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return allowedCountries;
    const query = countrySearch.toLowerCase();
    return allowedCountries.filter(
      (c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
    );
  }, [allowedCountries, countrySearch]);

  // Age calculation helper
  const calculateAge = (birthdateStr: string): number => {
    if (!birthdateStr) return 0;
    const birth = new Date(birthdateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // DOB date handler
  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const age = calculateAge(val);
    setFormData((prev) => ({ ...prev, dob: val, age }));
    if (age < 18) {
      setValidationError('You must be at least 18 years old to join the platform.');
    } else {
      setValidationError(null);
    }
  };

  // Select country from dropdown
  const handleSelectCountry = (country: CountryItem) => {
    setFormData((prev) => ({
      ...prev,
      nationality: country.name,
      countryCode: country.code,
    }));
    setIsCountryDropdownOpen(false);
    setCountrySearch('');
  };

  // Language toggle
  const toggleLanguage = (lang: string) => {
    setFormData((prev) => {
      const exists = prev.spokenLanguages.includes(lang);
      if (exists) {
        if (prev.spokenLanguages.length === 1) return prev;
        return { ...prev, spokenLanguages: prev.spokenLanguages.filter((l) => l !== lang) };
      } else {
        return { ...prev, spokenLanguages: [...prev.spokenLanguages, lang] };
      }
    });
  };

  // Interests / Tags toggle
  const toggleInterestOrTag = (item: string, isTag: boolean) => {
    if (isTag) {
      setFormData((prev) => {
        const exists = prev.tags.includes(item);
        if (exists) {
          return { ...prev, tags: prev.tags.filter((t) => t !== item) };
        } else {
          return { ...prev, tags: [...prev.tags, item] };
        }
      });
    } else {
      setFormData((prev) => {
        const exists = prev.interests.includes(item);
        if (exists) {
          return { ...prev, interests: prev.interests.filter((i) => i !== item) };
        } else {
          return { ...prev, interests: [...prev.interests, item] };
        }
      });
    }
  };

  // Upload handler to Cloudflare R2 with reliable local object preview
  const handleMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'avatar' | 'gallery' | 'intro_video'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setValidationError(null);

    try {
      if (type === 'avatar') {
        const file = files[0];
        // Create local object URL for instantaneous, fail-safe visual feedback
        const localUrl = URL.createObjectURL(file);
        setLocalAvatarPreview(localUrl);

        const res = await uploadMediaDirectlyToR2({
          file,
          userId: user.id,
          category: 'avatar',
          onProgress: (percent) => setUploadProgress((p) => ({ ...p, avatar: percent })),
        });

        setFormData((prev) => ({ ...prev, avatarUrl: res.publicUrl }));
        showToast('Avatar Uploaded 📸', 'Profile photo uploaded to Cloudflare R2 storage!', 'success');
      } else if (type === 'gallery') {
        const newUrls: string[] = [];
        const newLocalPreviews: string[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          newLocalPreviews.push(URL.createObjectURL(file));
          const uploadKey = `gallery_${i}`;
          const res = await uploadMediaDirectlyToR2({
            file,
            userId: user.id,
            category: 'gallery',
            onProgress: (percent) => setUploadProgress((p) => ({ ...p, [uploadKey]: percent })),
          });
          newUrls.push(res.publicUrl);
        }

        setLocalGalleryPreviews((prev) => [...prev, ...newLocalPreviews]);
        setFormData((prev) => ({ ...prev, gallery: [...prev.gallery, ...newUrls] }));
        showToast('Gallery Updated 🖼️', `${newUrls.length} photo(s) saved to media gallery!`, 'success');
      } else if (type === 'intro_video') {
        const file = files[0];
        if (file.size > 100 * 1024 * 1024) {
          setValidationError('Video file size exceeds 100MB limit.');
          setIsUploading(false);
          return;
        }
        const res = await uploadMediaDirectlyToR2({
          file,
          userId: user.id,
          category: 'intro_video',
          onProgress: (percent) => setUploadProgress((p) => ({ ...p, intro_video: percent })),
        });
        setFormData((prev) => ({ ...prev, introVideoUrl: res.publicUrl }));
        showToast('Video Uploaded 🎥', 'Introduction video uploaded successfully to R2!', 'success');
      }
    } catch (err: any) {
      console.error('R2 Media upload error:', err);
      setValidationError(err.message || 'Media upload to Cloudflare R2 encountered an issue. Local preview is active.');
      showToast('Upload Notice', err.message || 'Direct upload failed. Using local preview.', 'warning');
    } finally {
      setIsUploading(false);
    }
  };

  // Step Validation
  const validateCurrentStep = (): boolean => {
    setValidationError(null);

    if (currentStep === 1) {
      if (!formData.dob) {
        setValidationError('Please specify your date of birth.');
        return false;
      }
      if (formData.age < 18) {
        setValidationError('You must be 18 years or older to use this service.');
        return false;
      }
      if (!formData.nationality.trim()) {
        setValidationError('Please select your country of residence.');
        return false;
      }
      if (formData.spokenLanguages.length === 0) {
        setValidationError('Select at least one spoken language.');
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!formData.bio.trim()) {
        setValidationError('Please write a brief bio introducing yourself.');
        return false;
      }
      if (isFemaleHost && formData.tags.length === 0) {
        setValidationError('Please select at least one Host Specialty/Category.');
        return false;
      }
      if (!isFemaleHost && formData.interests.length === 0) {
        setValidationError('Please select at least one interest or hobby.');
        return false;
      }
      if (!formData.interestedIn || formData.interestedIn.length === 0) {
        setValidationError('Please choose who you are interested in connecting with.');
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      if (!formData.avatarUrl && !localAvatarPreview) {
        setValidationError('Please upload a primary profile photo.');
        return false;
      }
      return true;
    }

    if (currentStep === 4) {
      if (!formData.agreedToTerms) {
        setValidationError('You must agree to the Platform Terms of Service.');
        return false;
      }
      if (!isFemaleHost && !formData.agreedToAdultTerms) {
        setValidationError('You must acknowledge and agree to the 18+ Adult & Content Policy.');
        return false;
      }
      if (isFemaleHost && !formData.agreedToHostTerms) {
        setValidationError('You must accept the Host Code of Conduct and Platform Agreement.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      if (currentStep < totalSteps) {
        setCurrentStep((prev) => prev + 1);
      } else {
        handleSubmitFinal();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setValidationError(null);
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Final Registration Submission — only mark onboarded after DB persistence succeeds
  const handleSubmitFinal = async () => {
    if (!validateCurrentStep()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setValidationError(null);
    try {
      if (isSupabaseConfigured()) {
        const token = await getAccessToken();
        if (!token) {
          const msg = 'Your session expired. Please sign in again to finish profile setup.';
          setValidationError(msg);
          showToast('Session Required', msg, 'error');
          return;
        }
      }

      // Keep gender locked to account role — never escalate role from the client
      const lockedForm: OnboardingFormData = {
        ...formData,
        gender: lockedGender,
      };

      const result = await completeUserProfileOnboarding(user, lockedForm);
      if (result.success && result.updatedProfile) {
        updateUserProfile(result.updatedProfile.id, result.updatedProfile);
        showToast('Registration Complete! 🎉', 'Your profile has been saved.', 'success');
        onComplete(result.updatedProfile);
      } else {
        const msg = result.error || 'Failed to complete profile registration. Please try again.';
        setValidationError(msg);
        showToast('Save Failed', msg, 'error');
      }
    } catch (e: any) {
      console.error('Onboarding submit error:', e);
      const msg = 'An unexpected error occurred during profile registration.';
      setValidationError(msg);
      showToast('Save Failed', msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Current selected country entity
  const selectedCountryObj = useMemo(() => {
    return (
      allowedCountries.find(
        (c) => c.code.toUpperCase() === formData.countryCode.toUpperCase() || c.name.toLowerCase() === formData.nationality.toLowerCase()
      ) || { name: formData.nationality || 'United States', code: formData.countryCode || 'US', flag: '🌍', region: 'Worldwide' }
    );
  }, [allowedCountries, formData.countryCode, formData.nationality]);

  // 18-year max date limit for HTML date picker
  const maxDobDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#12141A] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6">
        {/* Header Ribbon */}
        <div className="relative bg-gradient-to-r from-rose-600/20 via-purple-600/20 to-indigo-600/20 border-b border-slate-800 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center space-x-2">
                  <span>Profile Onboarding & Registration</span>
                  <span
                    className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                      getFemaleRoleMark(user) === 'creator'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : getFemaleRoleMark(user) === 'user'
                        ? 'bg-pink-500/20 text-pink-300 border-pink-500/30'
                        : getUserRoleLabel(user) === 'Male User'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                    }`}
                  >
                    {getUserRoleLabel(user)}
                    {getFemaleRoleMark(user) === 'creator' && <span className="opacity-80">· Creator</span>}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Step {currentStep} of {totalSteps}:{' '}
                  {currentStep === 1
                    ? 'Age Gate & Geolocation'
                    : currentStep === 2
                    ? isFemaleHost
                      ? 'Host Specialties & Bio'
                      : 'Interests & Dating Bio'
                    : currentStep === 3
                    ? 'Avatar & Bio'
                    : 'Compliance & Platform Agreements'}
                </p>
              </div>
            </div>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step <= currentStep
                    ? isFemaleHost
                      ? 'bg-rose-500'
                      : 'bg-indigo-500'
                    : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {validationError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center space-x-3 text-rose-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* ================= STEP 1: AGE GATE & COUNTRY DROPDOWN ================= */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-start space-x-3.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Age Verification Gate (18+ Mandatory)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Our platform is strictly restricted to adults. Your date of birth is securely recorded and locked after registration.
                  </div>
                </div>
              </div>

              {/* Requirement 1: User Date Picker for DOB */}
              <div className="space-y-1.5">
                <DatePicker
                  id="reg-dob-picker"
                  value={formData.dob}
                  onChange={(newDob, newAge) => {
                    setFormData((prev) => ({ ...prev, dob: newDob, age: newAge }));
                    if (newAge < 18) {
                      setValidationError('You must be at least 18 years old to join the platform.');
                    } else {
                      setValidationError(null);
                    }
                  }}
                  minAge={18}
                  label="DATE OF BIRTH"
                  required
                />
              </div>

              {/* Requirement 2: Worldwide Countries Dropdown with Real Vector SVG Flags */}
              <CountrySelector
                value={formData.countryCode || formData.nationality}
                onChange={(country) =>
                  setFormData((prev) => ({
                    ...prev,
                    nationality: country.name,
                    countryCode: country.code,
                  }))
                }
                label="COUNTRY / NATIONALITY *"
                required
              />

              {/* Requirement 3: Zodiac Sign Selector with Real Vector SVG Glyph */}
              <ZodiacSelector
                value={formData.zodiac}
                onChange={(zodiac) =>
                  setFormData((prev) => ({
                    ...prev,
                    zodiac: zodiac ? zodiac.name : '',
                  }))
                }
                label="ZODIAC SIGN *"
                placeholder="Choose your astrological sign..."
              />

              {/* Requirement 4: Multi-Select Language Selector */}
              <LanguageSelector
                selectedLanguages={formData.spokenLanguages}
                onChange={(languages) =>
                  setFormData((prev) => ({
                    ...prev,
                    spokenLanguages: languages,
                  }))
                }
                label="LANGUAGES (MULTI-SELECT) *"
                required
              />
            </div>
          )}

          {/* ================= STEP 2: BIO, INTERESTS & CATEGORIZED TAGS ================= */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider mb-1.5">
                  {isFemaleHost ? 'HOST PROFILE BIO *' : 'ABOUT ME / BIO *'}
                </label>
                <textarea
                  rows={4}
                  value={formData.bio}
                  onChange={(e) => {
                    const bio = e.target.value;
                    setFormData((prev) => ({ ...prev, bio }));
                  }}
                  placeholder={
                    isFemaleHost
                      ? 'Introduce your hosting style, personality, streaming schedule, and conversation interests...'
                      : 'Share a little about yourself, hobbies, passions, and conversation topics...'
                  }
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-2xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
                />
                <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                  <span>Minimum 20 characters recommended.</span>
                  <span>{formData.bio.length} chars</span>
                </div>
              </div>

              {/* Categorized Multi-Select Interests — portal dropdown avoids modal overflow clipping */}
              <InterestSelector
                selectedInterests={formData.interests}
                onChange={(interests) =>
                  setFormData((prev) => ({
                    ...prev,
                    interests,
                    tags: isFemaleHost ? interests : prev.tags,
                  }))
                }
                label={isFemaleHost ? 'HOST SPECIALTIES & PASSIONS (MULTI-SELECT) *' : 'INTERESTS & LIFESTYLE (MULTI-SELECT) *'}
                placeholder="Select hobbies and passions..."
              />

              {/* Interested In — functional updater so interests chips are never wiped */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider mb-2">
                  INTERESTED IN CONNECTING WITH *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'female', label: 'Women', sub: 'Creators & Users', icon: '👩' },
                    { id: 'male', label: 'Men', sub: 'Male Users', icon: '👨' },
                    { id: 'everyone', label: 'Everyone', sub: 'All Users & Creators', icon: '👥' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          interestedIn: [opt.id],
                        }))
                      }
                      className={`p-3 rounded-2xl border text-xs font-bold text-left transition-all cursor-pointer ${
                        formData.interestedIn.includes(opt.id)
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{opt.icon}</span>
                          <div>
                            <div className="text-white font-bold">{opt.label}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{opt.sub}</div>
                          </div>
                        </div>
                        {formData.interestedIn.includes(opt.id) && (
                          <Check className="w-4 h-4 text-indigo-400 shrink-0 ml-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: AVATAR & BIO MEDIA ================= */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Primary Avatar Photo Upload with Curated Gallery & Instant R2 Preview */}
              <UnifiedImageUploader
                currentImageUrl={localAvatarPreview || formData.avatarUrl || (isFemaleHost ? FALLBACK_FEMALE_AVATAR : FALLBACK_MALE_AVATAR)}
                onImageUploaded={(newUrl) => {
                  setFormData((prev) => ({ ...prev, avatarUrl: newUrl }));
                  setLocalAvatarPreview(newUrl);
                }}
                userId={user.id}
                category="avatar"
                targetRole={user.role}
                targetName={user.name}
                accentColor={isFemaleHost ? 'pink' : user.role === 'team_leader' ? 'amber' : 'indigo'}
                title="PRIMARY PROFILE AVATAR *"
                subtitle="Upload a high-res photo from your device (Cloudflare R2) or select from curated avatar portraits & 3D models."
                showPresets={true}
                showUrlInput={true}
              />

              {/* Gallery Photos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider">
                    MEDIA GALLERY ({formData.gallery.length} PHOTOS)
                  </label>
                  <label className="text-xs text-rose-400 font-bold hover:underline cursor-pointer flex items-center space-x-1">
                    <Upload className="w-3 h-3" />
                    <span>Add More Photos</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleMediaUpload(e, 'gallery')}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {formData.gallery.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-slate-800 bg-slate-900">
                      <img
                        src={url}
                        alt={`Gallery ${idx}`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_FEMALE_AVATAR;
                        }}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, gallery: p.gallery.filter((_, i) => i !== idx) }))}
                        className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 rounded-md text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <label className="aspect-square rounded-xl border border-dashed border-slate-700 hover:border-rose-500 bg-slate-900/40 flex flex-col items-center justify-center text-slate-500 hover:text-rose-400 cursor-pointer transition-all">
                    <Upload className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleMediaUpload(e, 'gallery')}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </div>

              {/* Optional Intro Video */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase font-mono tracking-wider flex items-center space-x-1.5">
                    <Video className="w-4 h-4 text-purple-400" />
                    <span>{isFemaleHost ? 'INTRODUCTION VIDEO CLIP (RECOMMENDED)' : 'INTRO VIDEO (OPTIONAL)'}</span>
                  </label>
                  {formData.introVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, introVideoUrl: undefined }))}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Remove Video
                    </button>
                  )}
                </div>

                {formData.introVideoUrl ? (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
                    <video
                      src={formData.introVideoUrl}
                      controls
                      className="w-full max-h-48 rounded-xl bg-black object-contain"
                    />
                  </div>
                ) : (
                  <label className="p-6 border border-dashed border-slate-700 hover:border-purple-500 bg-slate-900/40 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all">
                    <Video className="w-8 h-8 text-purple-400 mb-2 animate-pulse" />
                    <div className="text-xs font-bold text-white">
                      {isUploading && uploadProgress.intro_video
                        ? `Streaming to R2... ${uploadProgress.intro_video}%`
                        : 'Upload 10-60s Introduction Video'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 max-w-sm">
                      MP4 or WebM video. Highlighting your smile and voice boosts interactions.
                    </div>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => handleMediaUpload(e, 'intro_video')}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 4: LEGAL POLICIES & CODE OF CONDUCT ================= */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-start space-x-3.5">
                <FileText className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Platform Compliance & Safety Standards</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Please review and accept our operating standards. These policies are enforced across all video interactions.
                  </div>
                </div>
              </div>

              {/* Policy 1: General Terms */}
              <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-start justify-between">
                  <div className="pr-4">
                    <div className="text-xs font-bold text-white">1. Master Terms of Service & Privacy Policy</div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      You agree to treat all members with dignity, refrain from harassment, hate speech, or sharing unauthorized media.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                    className="w-5 h-5 accent-rose-500 rounded cursor-pointer mt-1 flex-shrink-0"
                  />
                </div>
              </div>

              {/* Policy 2: Adult / Conduct Agreement */}
              {!isFemaleHost ? (
                <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="pr-4">
                      <div className="text-xs font-bold text-white">2. 18+ Adult Policy & Respectful Interaction</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        You confirm you are 18 years or older, agree to follow all safety guidelines, and acknowledge that inappropriate behavior results in immediate account suspension.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.agreedToAdultTerms}
                      onChange={(e) => setFormData({ ...formData, agreedToAdultTerms: e.target.checked })}
                      className="w-5 h-5 accent-rose-500 rounded cursor-pointer mt-1 flex-shrink-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="pr-4">
                      <div className="text-xs font-bold text-white">2. Host Code of Conduct & Platform Agreement</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        You agree to maintain a professional, respectful streaming environment. Earnings are disbursed per verified platform payout terms.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.agreedToHostTerms}
                      onChange={(e) => setFormData({ ...formData, agreedToHostTerms: e.target.checked })}
                      className="w-5 h-5 accent-rose-500 rounded cursor-pointer mt-1 flex-shrink-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-[#0D0F12] border-t border-slate-800 px-6 py-4 flex items-center justify-between">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            id="onboarding-next-btn"
            type="button"
            onClick={handleNext}
            disabled={isSubmitting || isUploading}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg transition-all cursor-pointer ${
              isFemaleHost
                ? 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-rose-500/25'
                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-indigo-500/25'
            } ${isSubmitting || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving to Database...</span>
              </>
            ) : currentStep < totalSteps ? (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Complete Registration & Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
