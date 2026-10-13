import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Key,
  HardDrive,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Unlock,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Check,
  Copy,
  Eye,
  EyeOff,
  Cpu,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ServerDiagnosticInfo, SetupConfigPayload } from '../../types';
import { PasswordStrengthField } from '../auth/PasswordStrengthField';
import { getPasswordPolicyError } from '../../../shared/passwordPolicy';
import { apiFetch } from '../../utils/apiClient';

interface ServerSetupWizardProps {
  onComplete?: () => void;
  onExit?: () => void;
}

export const ServerSetupWizard: React.FC<ServerSetupWizardProps> = ({ onComplete, onExit }) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [setupToken, setSetupToken] = useState('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('admin@livecall.com');
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Diagnostic State
  const [diagInfo, setDiagInfo] = useState<ServerDiagnosticInfo | null>(null);
  const [loadingDiag, setLoadingDiag] = useState<boolean>(true);
  const isVercelReadOnly = Boolean(
    diagInfo && ((diagInfo as any).readOnly || diagInfo.isEnvWritable === false)
  );

  // Active Step Tab: 0 = Overview, 1 = Database, 2 = LiveKit, 3 = Storage, 4 = SMTP, 5 = Admin, 6 = Finalize
  const [activeStep, setActiveStep] = useState<number>(0);

  // Form Configuration State
  const [formData, setFormData] = useState<SetupConfigPayload>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: '',
    livekitUrl: 'wss://your-livekit-project.livekit.cloud',
    livekitApiKey: '',
    livekitApiSecret: '',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2BucketName: 'livecall-media-storage',
    r2PublicUrl: '',
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: 'LiveCall <noreply@livecall-app.com>',
    smtpSecure: false,
    resendApiKey: '',
    adminPassword: '',
    coinBurnRatePerMin: 120,
    coinBurnRateFriendPerMin: 80,
    femaleHostSharePercent: 30,
    teamLeaderSharePercent: 10,
    lockInstaller: true,
  });

  // UI Visibility States
  const [showSecretKey, setShowSecretKey] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Test Results States
  const [testStates, setTestStates] = useState<{
    db: { loading: boolean; success?: boolean; message?: string };
    livekit: { loading: boolean; success?: boolean; message?: string };
    r2: { loading: boolean; success?: boolean; message?: string };
    smtp: { loading: boolean; success?: boolean; message?: string; testOtp?: string };
    save: { loading: boolean; success?: boolean; message?: string };
  }>({
    db: { loading: false },
    livekit: { loading: false },
    r2: { loading: false },
    smtp: { loading: false },
    save: { loading: false },
  });

  const [testEmailTarget, setTestEmailTarget] = useState<string>('');

  const toggleSecret = (field: string) => {
    setShowSecretKey((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch Server Status on mount
  const fetchServerStatus = async () => {
    setLoadingDiag(true);
    try {
      const res = await apiFetch('/api/setup/status');
      const data = await res.json();
      if (data.success) {
        setDiagInfo(data);
        // Pre-fill form from existing .env values if available
        if (data.envValues) {
          setFormData((prev) => ({
            ...prev,
            supabaseUrl: data.envValues.supabaseUrl || prev.supabaseUrl,
            supabaseAnonKey: data.envValues.supabaseAnonKey || prev.supabaseAnonKey,
            livekitUrl: data.envValues.livekitUrl || prev.livekitUrl,
            livekitApiKey: data.envValues.livekitApiKey || prev.livekitApiKey,
            r2AccountId: data.envValues.r2AccountId || prev.r2AccountId,
            r2AccessKeyId: data.envValues.r2AccessKeyId || prev.r2AccessKeyId,
            r2BucketName: data.envValues.r2BucketName || prev.r2BucketName,
            r2PublicUrl: data.envValues.r2PublicUrl || prev.r2PublicUrl,
            smtpHost: data.envValues.smtpHost || prev.smtpHost,
            smtpPort: data.envValues.smtpPort || prev.smtpPort,
            smtpUser: data.envValues.smtpUser || prev.smtpUser,
            smtpFrom: data.envValues.smtpFrom || prev.smtpFrom,
            smtpSecure: data.envValues.smtpSecure ?? prev.smtpSecure,
          }));
        }
      }
    } catch (err) {
      console.warn('Could not reach setup status endpoint:', err);
    } finally {
      setLoadingDiag(false);
    }
  };

  useEffect(() => {
    fetchServerStatus();
  }, []);

  // Handle Master Authentication
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await apiFetch('/api/setup/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          setSetupToken(data.token || '');
          setIsAuthenticated(true);
          return;
        } else {
          setAuthError(data.error || 'Authentication failed. Please check password.');
          return;
        }
      }

      setAuthError('Authentication failed. Set SETUP_MASTER_KEY in .env or use the admin account password.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Test Database Connection
  const handleTestDatabase = async () => {
    setTestStates((prev) => ({ ...prev, db: { loading: true } }));
    try {
      const res = await apiFetch('/api/setup/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify({
          supabaseUrl: formData.supabaseUrl,
          serviceRoleKey: formData.supabaseServiceRoleKey,
        }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        db: { loading: false, success: data.success, message: data.message },
      }));
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        db: { loading: false, success: false, message: err.message || 'Connection timeout.' },
      }));
    }
  };

  // Test LiveKit WebRTC
  const handleTestLiveKit = async () => {
    setTestStates((prev) => ({ ...prev, livekit: { loading: true } }));
    try {
      const res = await apiFetch('/api/setup/test-livekit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify({
          wsUrl: formData.livekitUrl,
          apiKey: formData.livekitApiKey,
          apiSecret: formData.livekitApiSecret,
        }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        livekit: { loading: false, success: data.success, message: data.message },
      }));
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        livekit: { loading: false, success: false, message: err.message || 'LiveKit test failed.' },
      }));
    }
  };

  // Test R2 Storage
  const handleTestR2 = async () => {
    setTestStates((prev) => ({ ...prev, r2: { loading: true } }));
    try {
      const res = await apiFetch('/api/setup/test-r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify({
          accountId: formData.r2AccountId,
          accessKeyId: formData.r2AccessKeyId,
          secretAccessKey: formData.r2SecretAccessKey,
          bucketName: formData.r2BucketName,
          publicUrl: formData.r2PublicUrl,
        }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        r2: { loading: false, success: data.success, message: data.message },
      }));
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        r2: { loading: false, success: false, message: err.message || 'R2 storage test failed.' },
      }));
    }
  };

  // Test SMTP
  const handleTestSmtp = async () => {
    setTestStates((prev) => ({ ...prev, smtp: { loading: true } }));
    try {
      const res = await apiFetch('/api/setup/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify({
          host: formData.smtpHost,
          port: formData.smtpPort,
          user: formData.smtpUser,
          pass: formData.smtpPass,
          from: formData.smtpFrom,
          secure: formData.smtpSecure,
          resendApiKey: formData.resendApiKey,
          targetEmail: testEmailTarget || formData.smtpUser || 'admin@livecall.com',
        }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        smtp: {
          loading: false,
          success: data.success,
          message: data.message,
          testOtp: data.testOtp,
        },
      }));
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        smtp: { loading: false, success: false, message: err.message || 'SMTP test failed.' },
      }));
    }
  };

  // Save All Configuration & Launch
  const handleSaveAllAndLaunch = async () => {
    if (isVercelReadOnly) {
      setTestStates((prev) => ({
        ...prev,
        save: {
          loading: false,
          success: false,
          message:
            'Vercel cannot write .env at runtime. Set Environment Variables in the Vercel dashboard, redeploy, then open the app.',
        },
      }));
      return;
    }
    if (formData.adminPassword) {
      const pwError = getPasswordPolicyError(formData.adminPassword);
      if (pwError) {
        setTestStates((prev) => ({
          ...prev,
          save: { loading: false, success: false, message: pwError },
        }));
        return;
      }
    }
    setTestStates((prev) => ({ ...prev, save: { loading: true } }));
    try {
      const res = await apiFetch('/api/setup/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setTestStates((prev) => ({
          ...prev,
          save: { loading: false, success: true, message: data.message },
        }));
        // Re-fetch status
        fetchServerStatus();
        setTimeout(() => {
          if (onComplete) {
            onComplete();
          } else {
            window.location.href = '/';
          }
        }, 1500);
      } else {
        const errMsg =
          (typeof data.error === 'object' && data.error?.message) ||
          data.error ||
          data.errorMessage ||
          'Failed to save configuration.';
        setTestStates((prev) => ({
          ...prev,
          save: { loading: false, success: false, message: errMsg },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        save: { loading: false, success: false, message: err.message || 'Save failed.' },
      }));
    }
  };

  const stepsList = [
    { id: 0, title: 'Server Diagnostic', icon: Server, desc: 'Environment & resources' },
    { id: 1, title: 'Database (Supabase)', icon: Database, desc: 'PostgreSQL connection' },
    { id: 2, title: 'LiveKit WebRTC', icon: Key, desc: 'HD Video cloud or VPS' },
    { id: 3, title: 'Media Storage (R2)', icon: HardDrive, desc: 'Cloudflare images/videos' },
    { id: 4, title: 'Email & OTP', icon: Mail, desc: 'SMTP & verification' },
    { id: 5, title: 'Master Admin', icon: ShieldCheck, desc: 'Security & economy' },
    { id: 6, title: 'Finalize & Launch', icon: Rocket, desc: 'Save .env & start app' },
  ];

  // =========================================================================
  // LOCK SCREEN / MASTER ADMIN AUTHENTICATION
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A0C10] flex items-center justify-center p-4 selection:bg-indigo-600 selection:text-white font-sans">
        <div className="w-full max-w-md bg-[#12151C] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Logo & Lock Header */}
          <div className="text-center space-y-2 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-pink-600 p-0.5 mx-auto shadow-xl flex items-center justify-center">
              <div className="w-full h-full bg-[#12151C] rounded-2xl flex items-center justify-center">
                <Lock className="w-7 h-7 text-pink-400" />
              </div>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Server Setup Wizard
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Password-protected server installation portal for VPS deployments.
            </p>
          </div>

          {/* Server Info Pill */}
          {diagInfo && (
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2 text-slate-400">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Node {diagInfo.nodeVersion}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                RAM: {diagInfo.memoryMb} MB
              </span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4 relative z-10">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Email Address
              </label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Master Setup / Admin Password
              </label>
              <div className="relative">
                <input
                  type={showSecretKey['auth'] ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="e.g. Admin@12345 or creator123"
                  className="w-full pr-10 pl-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => toggleSecret('auth')}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                >
                  {showSecretKey['auth'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Default VPS credentials: <code className="text-indigo-400 font-mono font-bold">Admin@12345</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center space-x-2"
            >
              {authLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Authenticate & Open Setup Wizard</span>
                </>
              )}
            </button>
          </form>

          {onExit && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onExit}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Return to Dating App
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN MULTI-STEP SETUP WIZARD INTERFACE
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#0A0C10] text-slate-200 p-4 sm:p-8 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Header Bar */}
      <div className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-pink-600 p-0.5 shadow-lg flex items-center justify-center">
            <div className="w-full h-full bg-[#12151C] rounded-xl flex items-center justify-center">
              <Rocket className="w-5 h-5 text-pink-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center space-x-2">
              <span>Server Installation & Setup Wizard</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                v1.0 VPS Live
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Interactive environment diagnostics, cloud credential provisioning, and automated <code className="text-indigo-300 font-mono">.env</code> synchronization.
            </p>
          </div>
        </div>

        {/* Live System Resource Pills */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          {diagInfo && (
            <>
              <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-slate-300">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Node {diagInfo.nodeVersion}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-emerald-300 font-bold">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{diagInfo.memoryMb} MB RAM</span>
              </div>
            </>
          )}

          {onExit && (
            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Exit to App
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 py-8 flex-1">
        {/* Left Step Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-2">
          <div className="bg-[#12151C] border border-slate-800 rounded-3xl p-4 shadow-xl space-y-2">
            <div className="px-3 py-2 text-xs font-extrabold text-slate-400 uppercase tracking-wider">
              Setup Steps
            </div>

            {stepsList.map((step) => {
              const Icon = step.icon;
              const isCurrent = activeStep === step.id;
              const isDone = activeStep > step.id;

              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-full text-left p-3 rounded-2xl transition-all flex items-center justify-between cursor-pointer ${
                    isCurrent
                      ? 'bg-gradient-to-r from-indigo-600/30 to-pink-600/30 border border-indigo-500/50 text-white shadow-md'
                      : 'hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : isDone
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white">{step.title}</div>
                      <div className="text-[10px] text-slate-400">{step.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              );
            })}
          </div>

          {/* Quick Service Status Overview Box */}
          {diagInfo && (
            <div className="bg-[#12151C] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-300">Live Services Health</span>
                <button
                  onClick={fetchServerStatus}
                  className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { name: 'PostgreSQL Database', active: diagInfo.services.database },
                  { name: 'LiveKit WebRTC (HD/4K)', active: diagInfo.services.livekit },
                  { name: 'Cloudflare R2 Storage', active: diagInfo.services.r2Storage },
                  { name: 'SMTP Email Service', active: diagInfo.services.smtp },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{s.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        s.active
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {s.active ? 'CONNECTED' : 'UNSET'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Step Content Container */}
        <div className="lg:col-span-8 bg-[#12151C] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between">
          <div>
            {/* STEP 0: SERVER OVERVIEW & DIAGNOSTICS */}
            {activeStep === 0 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center space-x-2">
                    <Server className="w-5 h-5 text-indigo-400" />
                    <span>Step 1: Server Environment & Diagnostics</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Verify that your VPS environment meets all required runtime prerequisites.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">Node.js Engine</span>
                    <div className="text-base font-bold text-white flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{diagInfo?.nodeVersion || 'v20.x'}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Node.js 18+ LTS or 20+ LTS supported.</p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">Host Operating System</span>
                    <div className="text-base font-bold text-white flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="capitalize">{diagInfo?.platform || 'Linux VPS'}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Ubuntu / Debian / CentOS / macOS / Windows.</p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">.env Disk Write Permissions</span>
                    <div className="text-base font-bold text-white flex items-center space-x-2">
                      {diagInfo?.isEnvWritable ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-300">Writable & Ready</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                          <span className="text-rose-300">Read-Only</span>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">Permits automatic credential persistence.</p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">WebSocket Real-Time Signaling</span>
                    <div className="text-base font-bold text-emerald-300 flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Active on Port 3000</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Integrated call ringing & presence bus.</p>
                  </div>
                </div>

                <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-indigo-300 font-bold text-xs">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>How This Wizard Works:</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    You can configure each service step-by-step or skip any service to keep default mock fallbacks active. Clicking <strong>"Test Connection"</strong> verifies your credentials live before saving.
                  </p>
                </div>

                {isVercelReadOnly && (
                  <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-2 text-amber-200 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <span>Vercel read-only environment</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      This deployment cannot write a local <code className="text-amber-200 font-mono">.env</code> file.
                      Use <strong>Vercel → Settings → Environment Variables</strong>, then redeploy.
                      Connection tests still work; Save &amp; Launch is disabled.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 1: DATABASE (SUPABASE) */}
            {activeStep === 1 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center space-x-2">
                      <Database className="w-5 h-5 text-emerald-400" />
                      <span>Step 2: Database Configuration (Supabase PostgreSQL)</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Connect your cloud PostgreSQL database for user auth, wallets, call histories, and admin data.
                    </p>
                  </div>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1"
                  >
                    <span>Supabase Dashboard</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {testStates.db.message && (
                  <div
                    className={`p-3.5 rounded-2xl text-xs flex items-center space-x-2.5 font-mono ${
                      testStates.db.success
                        ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {testStates.db.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{testStates.db.message}</span>
                  </div>
                )}

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-200 font-sans space-y-2">
                  <p className="font-bold text-emerald-300">Keys come from <code className="text-white">.env</code> / Vercel Environment Variables — not from this form.</p>
                  <p className="text-emerald-200/80">
                    Set <code className="text-white">VITE_SUPABASE_URL</code>, <code className="text-white">VITE_SUPABASE_ANON_KEY</code>, and{' '}
                    <code className="text-white">SUPABASE_SERVICE_ROLE_KEY</code>, then restart / redeploy.
                  </p>
                  <div className="font-mono text-[11px] text-slate-300 space-y-1 pt-1">
                    <div>URL: <span className="text-emerald-300">{formData.supabaseUrl || '— not loaded —'}</span></div>
                    <div>Anon: <span className="text-amber-300">{formData.supabaseAnonKey ? '•••••••• (env)' : '— not loaded —'}</span></div>
                    <div>Service: <span className="text-rose-300">{formData.supabaseServiceRoleKey ? '•••••••• (env)' : '— not loaded —'}</span></div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestDatabase}
                  disabled={testStates.db.loading || !formData.supabaseUrl}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
                >
                  {testStates.db.loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Test Database Connection</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STEP 2: LIVEKIT WEBRTC */}
            {activeStep === 2 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center space-x-2">
                      <Key className="w-5 h-5 text-amber-400" />
                      <span>Step 3: LiveKit WebRTC Video Cloud / VPS</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Configures the WebRTC SFU engine for 1080p/4K video calls and silent admin surveillance.
                    </p>
                  </div>
                  <a
                    href="https://cloud.livekit.io"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1"
                  >
                    <span>LiveKit Cloud</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {testStates.livekit.message && (
                  <div
                    className={`p-3.5 rounded-2xl text-xs flex items-center space-x-2.5 font-mono ${
                      testStates.livekit.success
                        ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {testStates.livekit.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{testStates.livekit.message}</span>
                  </div>
                )}

                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-100 font-sans space-y-2">
                  <p className="font-bold text-amber-300">LiveKit keys come from <code className="text-white">.env</code> / Vercel — not this form.</p>
                  <p className="text-amber-100/80">
                    Set <code className="text-white">LIVEKIT_URL</code>, <code className="text-white">LIVEKIT_API_KEY</code>,{' '}
                    <code className="text-white">LIVEKIT_API_SECRET</code>, then restart / redeploy.
                  </p>
                  <div className="font-mono text-[11px] text-slate-300 space-y-1 pt-1">
                    <div>URL: <span className="text-amber-300">{formData.livekitUrl || '— not loaded —'}</span></div>
                    <div>API Key: <span className="text-amber-200">{formData.livekitApiKey ? '•••••••• (env)' : '— not loaded —'}</span></div>
                    <div>Secret: <span className="text-rose-300">{formData.livekitApiSecret ? '•••••••• (env)' : '— not loaded —'}</span></div>
                  </div>
                </div>

                <div className="space-y-4">

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestLiveKit}
                      disabled={testStates.livekit.loading || !formData.livekitApiKey}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center space-x-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                    >
                      {testStates.livekit.loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          <span>Test LiveKit JWT & Token Generation</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: CLOUDFLARE R2 MEDIA STORAGE */}
            {activeStep === 3 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center space-x-2">
                      <HardDrive className="w-5 h-5 text-indigo-400" />
                      <span>Step 4: Cloudflare R2 / AWS S3 Storage</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      S3-compatible bucket for user avatars, creator photo galleries, and moments feeds.
                    </p>
                  </div>
                </div>

                {testStates.r2.message && (
                  <div
                    className={`p-3.5 rounded-2xl text-xs flex items-center space-x-2.5 font-mono ${
                      testStates.r2.success
                        ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {testStates.r2.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{testStates.r2.message}</span>
                  </div>
                )}

                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 text-xs text-indigo-100 font-sans space-y-2">
                  <p className="font-bold text-indigo-300">R2 keys come from <code className="text-white">.env</code> / Vercel — not this form.</p>
                  <p className="text-indigo-100/80">
                    Set <code className="text-white">R2_ACCOUNT_ID</code>, <code className="text-white">R2_ACCESS_KEY_ID</code>,{' '}
                    <code className="text-white">R2_SECRET_ACCESS_KEY</code>, <code className="text-white">R2_BUCKET_NAME</code>, then restart / redeploy.
                  </p>
                  <div className="font-mono text-[11px] text-slate-300 space-y-1 pt-1">
                    <div>Account: <span className="text-indigo-300">{formData.r2AccountId || '— not loaded —'}</span></div>
                    <div>Bucket: <span className="text-indigo-300">{formData.r2BucketName || '— not loaded —'}</span></div>
                    <div>Access Key: <span className="text-amber-300">{formData.r2AccessKeyId ? '•••••••• (env)' : '— not loaded —'}</span></div>
                    <div>Secret: <span className="text-rose-300">{formData.r2SecretAccessKey ? '•••••••• (env)' : '— not loaded —'}</span></div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestR2}
                    disabled={testStates.r2.loading || !formData.r2AccountId}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    {testStates.r2.loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <HardDrive className="w-4 h-4" />
                        <span>Test R2 Bucket Connectivity</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: SMTP EMAIL & OTP */}
            {activeStep === 4 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center space-x-2">
                      <Mail className="w-5 h-5 text-pink-400" />
                      <span>Step 5: Email Service & 6-Digit OTP Verification</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Configure SMTP (Gmail / Yahoo / Brevo / Resend) to send login and verification OTP codes.
                    </p>
                  </div>
                </div>

                {testStates.smtp.message && (
                  <div
                    className={`p-3.5 rounded-2xl text-xs flex items-center justify-between font-mono ${
                      testStates.smtp.success
                        ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {testStates.smtp.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      <span>{testStates.smtp.message}</span>
                    </div>
                    {testStates.smtp.testOtp && (
                      <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">
                        OTP: {testStates.smtp.testOtp}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      SMTP Host (<code className="text-pink-400 font-mono">SMTP_HOST</code>)
                    </label>
                    <input
                      type="text"
                      value={formData.smtpHost}
                      onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                      placeholder="smtp.mail.yahoo.com or smtp.gmail.com"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      SMTP Port (<code className="text-slate-400 font-mono">SMTP_PORT</code>)
                    </label>
                    <input
                      type="number"
                      value={formData.smtpPort}
                      onChange={(e) => setFormData({ ...formData, smtpPort: Number(e.target.value) })}
                      placeholder="587"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      SMTP User / Email (<code className="text-slate-400 font-mono">SMTP_USER</code>)
                    </label>
                    <input
                      type="text"
                      value={formData.smtpUser}
                      onChange={(e) => setFormData({ ...formData, smtpUser: e.target.value })}
                      placeholder="your-email@yahoo.com"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      SMTP App Password (<code className="text-slate-400 font-mono">SMTP_PASS</code>)
                    </label>
                    <div className="relative">
                      <input
                        type={showSecretKey['smtp_pass'] ? 'text' : 'password'}
                        value={formData.smtpPass}
                        onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                        placeholder="App password"
                        className="w-full pr-10 pl-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSecret('smtp_pass')}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                      >
                        {showSecretKey['smtp_pass'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      From Sender Header (<code className="text-slate-400 font-mono">SMTP_FROM</code>)
                    </label>
                    <input
                      type="text"
                      value={formData.smtpFrom}
                      onChange={(e) => setFormData({ ...formData, smtpFrom: e.target.value })}
                      placeholder="LiveCall <noreply@livecall-app.com>"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {/* Test Email Dispatch Box */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                  <span className="text-xs font-bold text-slate-300">Live OTP Test Email</span>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmailTarget}
                      onChange={(e) => setTestEmailTarget(e.target.value)}
                      placeholder="Enter email to receive test OTP..."
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={handleTestSmtp}
                      disabled={testStates.smtp.loading}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-md shadow-pink-600/30 cursor-pointer"
                    >
                      {testStates.smtp.loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          <span>Send Test OTP</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: MASTER ADMIN & ECONOMY */}
            {activeStep === 5 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    <span>Step 6: Master Admin Security & Platform Economy</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Set a new Super Admin password. Coin burn, shares, and Fixed Peg are configured only in Admin →
                    Coin Burn &amp; Economy after launch (not here).
                  </p>
                </div>

                <div className="space-y-4">
                  <PasswordStrengthField
                    id="setup-admin-password"
                    label="New Super Admin Password (Optional override)"
                    value={formData.adminPassword}
                    onChange={(adminPassword) => setFormData({ ...formData, adminPassword })}
                    placeholder="Leave blank to keep current password"
                    autoComplete="new-password"
                    required={false}
                    showStrengthUi={Boolean(formData.adminPassword)}
                    inputClassName="w-full pr-10 pl-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  />

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 space-y-2">
                    <div className="text-xs font-bold text-amber-200">Configured in Economy (read-only here)</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Global burn rates, host/TL call shares, gift shares, and Coin USD Peg live exclusively in{' '}
                      <span className="text-amber-300 font-semibold">Admin → Coin Burn &amp; Economy</span>. Schema
                      defaults apply until an admin edits them there. This wizard does not persist economy knobs.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 pt-1">
                      <div>Burn defaults: {formData.coinBurnRatePerMin}/{formData.coinBurnRateFriendPerMin} 🪙/min</div>
                      <div>
                        Shares defaults: host {formData.femaleHostSharePercent}% · TL{' '}
                        {formData.teamLeaderSharePercent}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: FINALIZE & LAUNCH */}
            {activeStep === 6 && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center space-x-2">
                    <Rocket className="w-5 h-5 text-pink-400" />
                    <span>Step 7: Final Review & 1-Click Launch</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Review summary, write configurations to <code className="text-indigo-300 font-mono">.env</code>, and start live operations.
                  </p>
                </div>

                {testStates.save.message && (
                  <div
                    className={`p-4 rounded-2xl text-xs flex items-center space-x-2.5 font-mono ${
                      testStates.save.success
                        ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {testStates.save.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span>{testStates.save.message}</span>
                  </div>
                )}

                {/* Service Check Table */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 divide-y divide-slate-800 text-xs font-mono">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">PostgreSQL Database:</span>
                    <span className="font-bold text-white truncate max-w-xs">{formData.supabaseUrl || 'Local Mock Fallback'}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">LiveKit WebRTC:</span>
                    <span className="font-bold text-white truncate max-w-xs">{formData.livekitUrl || 'WebRTC Fallback'}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">Cloudflare R2 Bucket:</span>
                    <span className="font-bold text-white truncate max-w-xs">{formData.r2BucketName}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">Email Dispatch:</span>
                    <span className="font-bold text-white truncate max-w-xs">{formData.smtpHost} ({formData.smtpUser || 'Default'})</span>
                  </div>
                </div>

                {/* Installer Security Lock Toggle */}
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2 text-xs font-bold text-white">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Lock Installer After Launching</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Recommended: Prevents unauthorized users from visiting this setup wizard URL.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.lockInstaller}
                    onChange={(e) => setFormData({ ...formData, lockInstaller: e.target.checked })}
                    className="w-5 h-5 rounded accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="pt-2 space-y-3">
                  {isVercelReadOnly ? (
                    <>
                      <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-xs text-amber-100 leading-relaxed">
                        Credentials must be set in the Vercel dashboard (not saved from this wizard). After env vars
                        are configured and redeployed, open the live app.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onComplete) onComplete();
                          else window.location.href = '/';
                        }}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                      >
                        <Rocket className="w-5 h-5" />
                        <span>Open Live App</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveAllAndLaunch}
                      disabled={testStates.save.loading}
                      className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                    >
                      {testStates.save.loading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Rocket className="w-5 h-5" />
                          <span>Save All Credentials & Launch Live App 🚀</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Step Progression Controls */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
              disabled={activeStep === 0}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                activeStep === 0
                  ? 'opacity-40 cursor-not-allowed text-slate-600'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Step</span>
            </button>

            <div className="text-xs font-mono text-slate-500">
              Step {activeStep + 1} of {stepsList.length}
            </div>

            {activeStep < stepsList.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep((prev) => Math.min(stepsList.length - 1, prev + 1))}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAllAndLaunch}
                disabled={testStates.save.loading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Finish & Launch</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
