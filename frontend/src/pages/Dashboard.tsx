import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, HardDrive, LayoutTemplate, Activity, History } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800/50 border-r border-white/5 flex flex-col p-4 gap-6">
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">C</div>
          <span className="font-semibold tracking-tight text-lg">CADNOVA.io</span>
        </div>
        
        <nav className="flex flex-col gap-1">
          <NavItem icon={<FolderOpen className="w-4 h-4" />} label="Recent Projects" active />
          <NavItem icon={<LayoutTemplate className="w-4 h-4" />} label="Templates" />
          <NavItem icon={<History className="w-4 h-4" />} label="Activity" />
        </nav>
        
        <div className="mt-auto p-4 rounded-xl bg-slate-900/50 border border-white/5">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-300">
            <HardDrive className="w-4 h-4" /> Cloud Storage
          </div>
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-indigo-500 w-[45%]" />
          </div>
          <p className="text-xs text-slate-400">4.5 GB of 10 GB used</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <header className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-2xl font-bold mb-1">Welcome back, Designer</h1>
              <p className="text-slate-400 text-sm">Here's what's happening with your projects.</p>
            </div>
            <button 
              onClick={() => navigate('/workspace')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          </header>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <StatCard title="Total Projects" value="12" trend="+2 this week" />
            <StatCard title="AI Generations" value="84" trend="15 tokens left" />
            <StatCard title="Shared Designs" value="3" trend="1 pending invite" />
          </div>

          <h2 className="text-lg font-semibold mb-4">Recent Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <ProjectCard key={i} index={i} onOpen={() => navigate('/workspace')} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active }: { icon: React.ReactNode, label: string, active?: boolean }) => (
  <button className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {icon}
    {label}
  </button>
);

const StatCard = ({ title, value, trend }: { title: string, value: string, trend: string }) => (
  <div className="p-5 rounded-xl bg-slate-800/30 border border-white/5">
    <h3 className="text-sm font-medium text-slate-400 mb-1">{title}</h3>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    <div className="text-xs text-emerald-400">{trend}</div>
  </div>
);

const ProjectCard = ({ index, onOpen }: { index: number, onOpen: () => void }) => (
  <div 
    onClick={onOpen}
    className="group cursor-pointer rounded-xl bg-slate-800/30 border border-white/5 overflow-hidden hover:border-indigo-500/50 transition-colors"
  >
    <div className="h-40 bg-slate-900 relative">
      {/* Mock Project Preview */}
      <div className="absolute inset-4 rounded border border-slate-700 bg-slate-800/50 overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full stroke-slate-600 fill-none opacity-50" strokeWidth="1">
          <rect x="10" y="10" width="80" height="80" />
          <line x1="10" y1="50" x2="90" y2="50" />
          <line x1="50" y1="10" x2="50" y2="90" />
        </svg>
      </div>
    </div>
    <div className="p-4">
      <h3 className="font-semibold text-white mb-1 group-hover:text-indigo-400 transition-colors">Smart Home Design {index}</h3>
      <p className="text-xs text-slate-500 flex items-center justify-between">
        <span>Edited 2 hours ago</span>
        <Activity className="w-3 h-3" />
      </p>
    </div>
  </div>
);

export default Dashboard;
