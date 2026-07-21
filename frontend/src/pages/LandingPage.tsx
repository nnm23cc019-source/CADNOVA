import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Layers, Zap, ArrowRight, ShieldCheck, Cpu, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuthStore } from '../store/authStore';

const LandingPage = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
    setError('');
    setSuccess('');
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (authMode === 'register') {
        const res = await api.post('/auth/register', { username, password, role: 'user' });
        if (res.success) {
          setSuccess('Account created successfully');
          setTimeout(() => {
            setAuthMode('login');
            setSuccess('');
          }, 1500);
        } else {
          setError(res.error || 'Registration failed');
        }
      } else {
        const res = await api.post('/auth/login', { username, password });
        if (res.success) {
          login(res.user, res.token);
          setAuthModalOpen(false);
          navigate('/dashboard');
        } else {
          setError(res.error || 'Invalid credentials');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Navbar */}
      <nav className="fixed w-full top-0 z-40 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Box className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">CADNOVA.io</span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#demo" className="hover:text-white transition-colors">Demo</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => openAuth('login')} className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Log In</button>
            <button onClick={() => openAuth('register')} className="px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-medium hover:bg-slate-200 transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-6 border border-indigo-500/20">
              <SparklesIcon className="w-4 h-4" />
              CADNOVA.io 2.0 is now live
            </span>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-tight">
              Design the future with <br className="hidden md:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                AI Cloud CAD
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              The industry-leading intelligent CAD platform for smart homes, architecture, and structural engineering. Powered by next-gen AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => openAuth('login')}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium text-lg hover:shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center gap-2 group w-full sm:w-auto justify-center"
              >
                Launch Workspace
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="px-8 py-4 rounded-xl bg-slate-800/50 text-white font-medium text-lg border border-white/10 hover:bg-slate-800 transition-colors w-full sm:w-auto">
                View Demo
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
              onClick={() => setAuthModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-slate-800 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <button 
                onClick={() => setAuthModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-8">
                <h2 className="text-2xl font-bold mb-2">
                  {authMode === 'login' ? 'Welcome back' : 'Create an account'}
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                  {authMode === 'login' 
                    ? 'Enter your credentials to access your workspace.' 
                    : 'Sign up to start designing with AI.'}
                </p>

                {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
                {success && <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{success}</div>}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                    <input 
                      type="text" 
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="Enter your username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                    <input 
                      type="password" 
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="mt-2 w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-medium rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Log In' : 'Register Account')}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-400">
                  {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <button 
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'register' : 'login');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    {authMode === 'login' ? 'Sign up' : 'Log in'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise-grade capabilities</h2>
            <p className="text-slate-400">Everything you need to design, simulate, and render in one cloud platform.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Cpu className="w-6 h-6 text-indigo-400" />}
              title="AI Design Copilot"
              desc="Generate floor plans, electrical layouts, and HVAC systems instantly using natural language prompts."
            />
            <FeatureCard 
              icon={<Layers className="w-6 h-6 text-purple-400" />}
              title="Advanced Layering"
              desc="AutoCAD-style layer management with full visibility control, grouping, and property overrides."
            />
            <FeatureCard 
              icon={<Zap className="w-6 h-6 text-amber-400" />}
              title="Real-time Rendering"
              desc="Switch seamlessly between 2D wireframe and realistic 3D with sunlight and shadow simulation."
            />
            <FeatureCard 
              icon={<ShieldCheck className="w-6 h-6 text-emerald-400" />}
              title="Enterprise Security"
              desc="End-to-end encryption, role-based access control, and continuous automated cloud backups."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-slate-300">CADNOVA.io</span>
          </div>
          <p>© 2026 CADNOVA.io Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="p-6 rounded-2xl bg-slate-800/30 border border-white/5 hover:border-white/10 hover:bg-slate-800/50 transition-colors">
    <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-4 border border-white/5">
      {icon}
    </div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
  </div>
);

export default LandingPage;
