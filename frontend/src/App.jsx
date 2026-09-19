import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, ShieldAlert, Users, Search, Bell, ArrowLeft, Plus, LogOut } from 'lucide-react';
import { io } from 'socket.io-client';
import { api, SOCKET_URL } from './lib/api';

// --- MAIN LAYOUT COMPONENTS ---
const Sidebar = () => (
  <aside className="w-64 border-r border-gray-800 bg-gray-950 p-6 flex flex-col h-screen fixed">
    <div className="flex items-center gap-3 mb-10 text-neon-green font-bold text-xl">
      <ShieldAlert /> UEBA System
    </div>
    <nav className="flex flex-col gap-2">
      <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-gray-800 text-neon-green' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        <LayoutDashboard className="w-5 h-5" /> Dashboard
      </NavLink>
      <NavLink to="/alerts" className={({ isActive }) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-gray-800 text-neon-green' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        <AlertTriangle className="w-5 h-5" /> Alerts
      </NavLink>
      <NavLink to="/cases" className={({ isActive }) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-gray-800 text-neon-green' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        <ShieldAlert className="w-5 h-5" /> Cases
      </NavLink>
      <NavLink to="/users" className={({ isActive }) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-gray-800 text-neon-green' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        <Users className="w-5 h-5" /> Users
      </NavLink>
    </nav>
  </aside>
);

const Header = ({ unreadAlerts, onBellClick, currentUser, onLogout, usersData = [], liveAlerts = [] }) => {
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();

  const handleDropdownItemClick = (username) => {
    setSearch('');
    setShowSearch(false);
    navigate(`/profile/${username}`);
  };

  const filteredUsers = search.trim() ? usersData.filter(u => u.username.toLowerCase().includes(search.toLowerCase())) : [];

  return (
    <header className="h-20 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10 w-full">
      <div className="relative">
        <div className="flex items-center bg-gray-900 rounded-lg px-4 py-2 w-96 border border-gray-800 relative z-20">
          <Search className="w-5 h-5 text-gray-400 mr-2" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search users..." 
            className="bg-transparent border-none outline-none text-white w-full" 
          />
        </div>
        
        {showSearch && search.trim() && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowSearch(false)}></div>
            <div className="absolute top-12 left-0 w-96 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-30 max-h-64 overflow-y-auto">
              {filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <div key={u.id} className="p-3 border-b border-gray-800 hover:bg-gray-800 cursor-pointer" onClick={() => handleDropdownItemClick(u.username)}>
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">{u.username}</span>
                      <span className={`text-xs px-2 py-1 rounded ${u.riskScore > 75 ? 'bg-neon-red/20 text-neon-red' : u.riskScore > 40 ? 'bg-neon-yellow/20 text-neon-yellow' : 'bg-neon-green/20 text-neon-green'}`}>
                        Score: {u.riskScore}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-gray-400 text-sm">No users found.</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <button 
            type="button" 
            onClick={() => { 
                setShowNotifications(!showNotifications); 
                if (unreadAlerts > 0) onBellClick(); 
            }} 
            className="relative cursor-pointer z-20"
          >
            <Bell className="w-6 h-6 text-gray-300 hover:text-white" />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 bg-neon-red text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {unreadAlerts}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)}></div>
              <div className="absolute top-10 right-0 w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-30 max-h-80 overflow-y-auto">
                <div className="p-3 border-b border-gray-800 font-bold text-white sticky top-0 bg-gray-900">Recent Alerts</div>
                {liveAlerts.length > 0 ? (
                  liveAlerts.slice(0, 5).map((alert, idx) => (
                    <div key={idx} className="p-3 border-b border-gray-800 hover:bg-gray-800 cursor-pointer" onClick={() => { setShowNotifications(false); navigate('/alerts'); }}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-neon-red text-sm font-bold truncate pr-2">{alert.type}</span>
                        <span className="text-gray-500 text-xs">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-gray-300 text-xs truncate">Target: {alert.entity || alert.username}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-gray-400 text-sm text-center">No alerts.</div>
                )}
                <div className="p-2 text-center border-t border-gray-800">
                   <button onClick={() => { setShowNotifications(false); navigate('/alerts'); }} className="text-neon-green text-sm hover:underline">View All Alerts</button>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">{currentUser?.username?.substring(0,2).toUpperCase() || 'AD'}</div>
          <div className="text-sm">
            <p className="font-bold text-white">{currentUser?.username || 'Analyst'}</p>
            <p className="text-gray-400 capitalize">{currentUser?.role || 'Security Analyst'}</p>
          </div>
          <button type="button" onClick={onLogout} className="text-gray-400 hover:text-white transition-colors" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

const LoginScreen = ({ onLogin, errorMessage }) => {
  const [form, setForm] = useState({ username: 'analyst', password: 'analyst123' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onLogin(form);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2">UEBA Analyst Login</h1>
        <p className="text-sm text-gray-400 mb-6">Authenticate to access secured write operations.</p>
        {errorMessage && <p className="mb-4 text-sm text-red-300">{errorMessage}</p>}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-neon-cyan transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-neon-cyan transition-colors"
              required
            />
          </div>
          <button disabled={isSubmitting} className="w-full bg-neon-green text-gray-950 font-bold rounded py-3 hover:bg-[#0be60b] transition-colors disabled:opacity-60" type="submit">
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- PAGES ---

const Dashboard = ({ liveAlerts, globalScore, appError }) => {
  const [alerts, setAlerts] = useState([]);
  
  useEffect(() => {
    fetchAlerts();
  }, []);
  
  // Update internal alerts list when new liveAlert comes in
  useEffect(() => {
    if (liveAlerts.length > 0) {
      setAlerts(prev => [liveAlerts[0], ...prev].slice(0, 10)); // Keep top 10 recent
    }
  }, [liveAlerts]);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/api/v1/alerts');
      setAlerts(res.data.slice(0, 5));
    } catch (err) {
      console.error('Failed to fetch alerts', err);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">Security Overview</h1>
      {appError && (
        <div className="mb-4 rounded-lg border border-neon-red/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {appError}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Global Risk Score Widget */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <h2 className="text-gray-400 font-semibold mb-4">Global Risk Score</h2>
          <div className={`text-6xl font-black z-10 ${globalScore > 75 ? 'text-neon-red' : globalScore > 40 ? 'text-neon-orange' : 'text-neon-green'}`}>
            {globalScore}
          </div>
          <p className="text-gray-400 mt-2 text-sm uppercase font-bold tracking-wider z-10">Avg Top 3 Risky Users</p>
          {/* Decorative glow */}
          <div className={`absolute w-32 h-32 blur-3xl rounded-full opacity-20 ${globalScore > 75 ? 'bg-neon-red' : globalScore > 40 ? 'bg-neon-orange' : 'bg-neon-green'}`} />
        </div>
        
        {/* Recent Alerts Widget */}
        <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col">
          <h2 className="text-gray-400 font-semibold mb-4">Recent Alerts (Live)</h2>
          <div className="space-y-3 overflow-y-auto flex-1 h-48">
            {alerts.slice(0, 4).map(alert => (
              <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-950 rounded border border-gray-800 hover:border-gray-600 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] 
                    ${alert.severity === 'critical' ? 'bg-neon-red shadow-neon-red' : 
                      alert.severity === 'high' ? 'bg-neon-orange shadow-neon-orange' : 
                      alert.severity === 'medium' ? 'bg-yellow-400 shadow-yellow-400' : 'bg-neon-cyan shadow-neon-cyan'}`} />
                  <span className="text-white font-medium">{alert.type}</span>
                  <span className="text-gray-500 text-sm ml-2">by {alert.user}</span>
                </div>
                <span className="text-gray-400 text-sm">{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Alerts = ({ liveAlerts }) => {
  const [alerts, setAlerts] = useState([]);
  
  useEffect(() => {
    fetchAlerts();
  }, []);

  useEffect(() => {
    if (liveAlerts.length > 0) {
      setAlerts(prev => [liveAlerts[0], ...prev]);
    }
  }, [liveAlerts]);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/api/v1/alerts');
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to fetch alerts', err);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">Alerts Directory</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left bg-gray-900">
          <thead className="bg-gray-950 border-b border-gray-800">
            <tr>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Type</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Severity</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">User</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map(alert => (
              <tr key={alert.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="p-4 text-white font-medium">{alert.type}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 bg-gray-950 text-xs font-bold rounded uppercase border tracking-wider
                    ${alert.severity === 'critical' ? 'text-neon-red border-neon-red shadow-[0_0_5px_rgba(255,0,60,0.3)]' : 
                      alert.severity === 'high' ? 'text-neon-orange border-neon-orange shadow-[0_0_5px_rgba(255,85,0,0.3)]' : 
                      alert.severity === 'medium' ? 'text-yellow-400 border-yellow-400' : 'text-neon-cyan border-neon-cyan'}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="p-4 text-gray-300">
                  <NavLink to={`/profile/${alert.user}`} className="hover:text-neon-cyan hover:underline">{alert.user}</NavLink>
                </td>
                <td className="p-4 text-gray-400 text-sm">{new Date(alert.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Cases = () => {
  const [cases, setCases] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState({ title: '', severity: 'Medium', assignee: '' });
  const [formError, setFormError] = useState('');
  
  // Status update state
  const [editingCaseId, setEditingCaseId] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const res = await api.get('/api/v1/cases');
      setCases(res.data);
    } catch (err) {
      console.error('Failed to fetch cases', err);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    try {
      setFormError('');
      await api.post('/api/v1/cases', newCaseForm);
      setIsModalOpen(false);
      setNewCaseForm({ title: '', severity: 'Medium', assignee: '' });
      fetchCases();
    } catch (err) {
      const serverMessage = err?.response?.data?.details?.[0]?.message || err?.response?.data?.error;
      setFormError(serverMessage || 'Could not create case. Please verify your input and retry.');
    }
  };

  const handleUpdateStatus = async (caseId, newStatus) => {
    try {
      setStatusUpdating(true);
      await api.patch(`/api/v1/cases/${caseId}`, { status: newStatus });
      setEditingCaseId(null);
      fetchCases();
    } catch (err) {
      console.error('Failed to update case', err);
      alert(err?.response?.data?.error || 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div className="p-8 relative">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Investigation Cases</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-neon-green text-gray-950 font-bold px-4 py-2 rounded-lg hover:bg-[#0be60b] hover:shadow-[0_0_15px_rgba(13,242,13,0.4)] transition-all">
          <Plus className="w-5 h-5" /> Create New Case
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 p-8 rounded-xl w-[500px] shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-6">Create Case</h2>
            {formError && <p className="mb-4 text-sm text-red-300">{formError}</p>}
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Case Title</label>
                <input required type="text" value={newCaseForm.title} onChange={e => setNewCaseForm({...newCaseForm, title: e.target.value})} className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-neon-cyan transition-colors" placeholder="E.g., Suspected Credential Theft" />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">Severity</label>
                <select value={newCaseForm.severity} onChange={e => setNewCaseForm({...newCaseForm, severity: e.target.value})} className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-neon-cyan transition-colors">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">Assignee</label>
                <input required type="text" value={newCaseForm.assignee} onChange={e => setNewCaseForm({...newCaseForm, assignee: e.target.value})} className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-neon-cyan transition-colors" placeholder="Username" />
              </div>
              <div className="flex gap-4 mt-8 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-neon-green text-gray-950 font-bold rounded py-3 hover:bg-[#0be60b] transition-colors">Save Case</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left bg-gray-900">
          <thead className="bg-gray-950 border-b border-gray-800">
            <tr>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Case ID</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Title</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Status</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Assignee</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors pointer-default">
                  <td className="p-4 text-gray-400 font-mono">{c.id}</td>
                  <td className="p-4 text-white font-medium">{c.title}</td>
                  <td className="p-4">
                    {editingCaseId === c.id ? (
                      <select 
                        autoFocus
                        disabled={statusUpdating}
                        defaultValue={c.status}
                        onBlur={() => setEditingCaseId(null)}
                        onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                        className="bg-gray-950 border border-neon-cyan rounded px-2 py-1 text-white text-xs"
                      >
                        <option value="Open">OPEN</option>
                        <option value="Investigating">INVESTIGATING</option>
                        <option value="Contained">CONTAINED</option>
                        <option value="Resolved">RESOLVED</option>
                      </select>
                    ) : (
                      <button 
                        onClick={() => setEditingCaseId(c.id)}
                        className={`px-2 py-1 bg-gray-950 text-xs font-bold rounded uppercase border tracking-wider hover:bg-gray-800 transition-colors ${['open', 'investigating'].includes(c.status.toLowerCase()) ? 'text-neon-cyan border-neon-cyan shadow-[0_0_5px_rgba(0,229,255,0.3)]' : 'text-gray-400 border-gray-600'}`}
                        title="Click to edit status"
                      >
                        {c.status}
                      </button>
                    )}
                </td>
                <td className="p-4 text-gray-300">{c.assignee}</td>
                <td className="p-4 text-gray-500 text-sm">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const UsersPage = ({ usersData }) => {
  const navigate = useNavigate();
  const sortedUsers = [...usersData].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-white">User Directory</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left bg-gray-900">
          <thead className="bg-gray-950 border-b border-gray-800">
            <tr>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Username</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Risk Score</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Department</th>
              <th className="p-4 text-gray-400 font-medium tracking-wider text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(u => (
              <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="p-4 text-white font-medium flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-700" />
                  {u.username}
                </td>
                <td className="p-4">
                  <div className={`text-xl font-bold flex items-center gap-2
                    ${u.riskScore > 75 ? 'text-neon-red' : u.riskScore > 40 ? 'text-neon-orange' : 'text-neon-green'}`}>
                    {u.riskScore}
                    {u.riskScore > 75 && <AlertTriangle className="w-4 h-4" />}
                  </div>
                </td>
                <td className="p-4 text-gray-400">{u.department}</td>
                <td className="p-4">
                  <button onClick={() => navigate(`/profile/${u.username}`)} className="text-neon-cyan hover:text-white hover:underline text-sm font-medium">View Profile</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const UserProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    fetchProfile();
    // In a real app we would listen for socket updates specific to this user here as well
  }, [username]);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setProfileError('');
      const res = await api.get(`/api/v1/users/${username}`);
      setProfile(res.data);
    } catch (err) {
      setProfileError(err?.response?.status === 404 ? 'User not found.' : 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="p-8 text-white">Loading profile...</div>;
  if (profileError) return <div className="p-8 text-red-300">{profileError}</div>;
  if (!profile) return <div className="p-8 text-gray-300">No profile data.</div>;

  return (
    <div className="p-8">
      <button onClick={() => navigate('/users')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Directory
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-gray-800 border-4 border-gray-700 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-1">{profile.username}</h2>
          <p className="text-gray-400 mb-6">{profile.department}</p>
          
          <div className="w-full bg-gray-950 rounded-lg p-4 border border-gray-800 flex justify-between items-center mb-4">
            <span className="text-gray-400">Current Risk Score</span>
            <span className={`text-3xl font-black ${profile.riskScore > 75 ? 'text-neon-red' : profile.riskScore > 40 ? 'text-neon-orange' : 'text-neon-green'}`}>
              {profile.riskScore}
            </span>
          </div>

          <div className="w-full text-sm text-gray-500 flex justify-between">
            <span>Last Active:</span>
            <span>{new Date(profile.lastActive).toLocaleTimeString()}</span>
          </div>
        </div>

        {/* User Specific Alerts */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Alert History</h2>
          {profile.alerts && profile.alerts.length > 0 ? (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {profile.alerts.map(alert => (
                <div key={alert.id} className="bg-gray-950 border border-gray-800 p-4 rounded-lg flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded border
                        ${alert.severity === 'critical' ? 'text-neon-red border-neon-red' : 
                          alert.severity === 'high' ? 'text-neon-orange border-neon-orange' : 
                          alert.severity === 'medium' ? 'text-yellow-400 border-yellow-400' : 'text-neon-cyan border-neon-cyan'}`}>
                        {alert.severity}
                      </span>
                      <strong className="text-white">{alert.type}</strong>
                    </div>
                    <p className="text-gray-500 text-sm">Detected anomalous behavior matching signature constraints.</p>
                  </div>
                  <span className="text-gray-500 text-sm">{new Date(alert.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500">No alerts found for this user.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- APP ROOT ---

function App() {
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalScore, setGlobalScore] = useState(0);
  const [usersData, setUsersData] = useState([]);
  const [appError, setAppError] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const handleLogin = async (credentials) => {
    setAuthError('');
    try {
      const res = await api.post('/api/v1/auth/login', credentials);
      const nextUser = { username: res.data.username, role: res.data.role };
      setCurrentUser(nextUser);
    } catch {
      setAuthError('Invalid credentials. Use your configured auth account.');
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Logout should still clear local in-memory auth state if backend call fails.
    }

    setCurrentUser(null);
    setLiveAlerts([]);
    setUnreadCount(0);
    setGlobalScore(0);
    setUsersData([]);
    setAppError('');
  };

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const res = await api.get('/api/v1/auth/me');
        setCurrentUser({ username: res.data.username, role: res.data.role });
      } catch {
        setCurrentUser(null);
      } finally {
        setIsAuthReady(true);
      }
    };

    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const fetchInitialData = async () => {
      try {
        setAppError('');
        const [usersRes, scoreRes] = await Promise.all([
          api.get('/api/v1/users'),
          api.get('/api/v1/stats/global')
        ]);
        setUsersData(usersRes.data);
        setGlobalScore(scoreRes.data.score);
      } catch (err) {
        setAppError('Backend is unavailable or misconfigured. Check server status and API URL.');
      }
    };

    fetchInitialData();

    // Connect to WebSockets
    const socket = io(SOCKET_URL);
    
    socket.on('alert', (data) => {
      setLiveAlerts(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    socket.on('users_updated', (updatedUsers) => {
      setUsersData(updatedUsers);
    });

    socket.on('global_score_updated', (score) => {
      setGlobalScore(score);
    });

    return () => socket.disconnect();
  }, [currentUser]);

  if (!isAuthReady) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-300">Checking session...</div>;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} errorMessage={authError} />;
  }

  return (
    <Router>
      <div className="flex bg-gray-950 text-gray-100 min-h-screen font-sans selection:bg-neon-green/30">
        <Sidebar />
        <div className="ml-64 flex-1 flex flex-col min-h-screen">
          <Header
              unreadAlerts={unreadCount}
              onBellClick={() => setUnreadCount(0)}
              currentUser={currentUser}
              onLogout={handleLogout}
              usersData={usersData}
              liveAlerts={liveAlerts}
            />
          <main className="flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 to-gray-950">
            <Routes>
              <Route path="/" element={<Dashboard liveAlerts={liveAlerts} globalScore={globalScore} appError={appError} />} />
              <Route path="/alerts" element={<Alerts liveAlerts={liveAlerts} />} />
              <Route path="/cases" element={<Cases />} />
              <Route path="/users" element={<UsersPage usersData={usersData} />} />
              <Route path="/profile/:username" element={<UserProfile />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
