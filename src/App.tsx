import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Terminal, 
  Activity, 
  Database, 
  Server, 
  RefreshCcw,
  RefreshCw,
  Search,
  AlertCircle,
  X,
  Clock,
  Box,
  Monitor
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import TerminalOverlay from './components/TerminalOverlay';

interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

interface AuditLog {
  _id: string;
  containerName: string;
  action: string;
  timestamp: string;
  status: string;
}

export default function App() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [inspectContainerId, setInspectContainerId] = useState<string | null>(null);
  const [terminalContainerId, setTerminalContainerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'exited'>('all');
  const [logs, setLogs] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchContainers();
    fetchAuditLogs();
    const interval = setInterval(fetchContainers, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedContainer) {
      socketRef.current = io();
      socketRef.current.emit('stream-logs', selectedContainer);
      socketRef.current.on('log-data', (data: string) => {
        setLogs(prev => [...prev.slice(-200), data]);
      });
      socketRef.current.on('log-error', (err: string) => {
        setError(err);
      });
    } else {
      socketRef.current?.disconnect();
      setLogs([]);
    }
    return () => {
      socketRef.current?.disconnect();
    };
  }, [selectedContainer]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/containers');
      const data = await res.json();
      setContainers(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to connect to Docker API');
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setAuditLogs(data);
    } catch (err) {
      console.warn('Could not fetch audit logs');
    }
  };

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const res = await fetch(`/api/containers/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      fetchContainers();
      fetchAuditLogs();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} container`);
    }
  };

  const handleBulkAction = async (action: 'start' | 'stop') => {
    const targets = containers.filter(c => 
      action === 'start' ? c.State !== 'running' : c.State === 'running'
    );
    
    if (targets.length === 0) return;
    
    try {
      await Promise.all(targets.map(c => 
        fetch(`/api/containers/${c.Id}/${action}`, { method: 'POST' })
      ));
      fetchContainers();
      fetchAuditLogs();
    } catch (err) {
      setError(`Failed to ${action} all containers`);
    }
  };

  const filteredContainers = containers.filter(container => {
    const matchesSearch = container.Names[0].toLowerCase().includes(searchQuery.toLowerCase()) || 
                          container.Image.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || 
                          (filterStatus === 'running' && container.State === 'running') ||
                          (filterStatus === 'exited' && container.State !== 'running');
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-zinc-400 flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="animate-spin w-8 h-8 text-blue-500" />
          <p className="animate-pulse">BOOTING DASHBOARD_OS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 p-6 backdrop-blur-xl sticky top-0 z-10 bg-[#0a0a0a]/80">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Box className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase italic font-serif">Docker_Mission_Control</h1>
              <p className="text-xs font-mono text-zinc-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                SYSTEMS_OPERATIONAL // NODE_V1.0.4
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="flex flex-col items-end">
              <span className="text-zinc-500">DAEMON_SOCKET</span>
              <span className="text-blue-400">/var/run/docker.sock</span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-zinc-500">ACTIVE_INSTANCES</span>
              <span className="text-green-400 font-bold">{containers.filter(c => c.State === 'running').length}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400 font-mono text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Container List */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Server className="w-4 h-4" />
                Container_Registry
              </h2>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleBulkAction('start')}
                    className="text-[9px] font-mono text-zinc-500 hover:text-green-500 transition-colors uppercase"
                    title="Start all stopped containers"
                  >
                    Start_All
                  </button>
                  <span className="text-zinc-800">/</span>
                  <button 
                    onClick={() => handleBulkAction('stop')}
                    className="text-[9px] font-mono text-zinc-500 hover:text-red-500 transition-colors uppercase"
                    title="Stop all running containers"
                  >
                    Stop_All
                  </button>
                </div>
                
                <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                  <input
                    type="text"
                    placeholder="FIND_CONTAINER..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-full sm:w-48 font-mono"
                  />
                </div>
                <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 font-mono text-[10px]">
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-2 py-0.5 rounded ${filterStatus === 'all' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-600'}`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setFilterStatus('running')}
                    className={`px-2 py-0.5 rounded ${filterStatus === 'running' ? 'bg-zinc-800 text-green-400' : 'text-zinc-600'}`}
                  >
                    RUN
                  </button>
                  <button
                    onClick={() => setFilterStatus('exited')}
                    className={`px-2 py-0.5 rounded ${filterStatus === 'exited' ? 'bg-zinc-800 text-red-400' : 'text-zinc-600'}`}
                  >
                    OFF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden border border-zinc-800 rounded-xl bg-zinc-900/30 backdrop-blur-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="p-4 text-[11px] font-serif italic uppercase text-zinc-500 tracking-wider">Name/ID</th>
                    <th className="p-4 text-[11px] font-serif italic uppercase text-zinc-500 tracking-wider">Image</th>
                    <th className="p-4 text-[11px] font-serif italic uppercase text-zinc-500 tracking-wider hidden md:table-cell">Usage</th>
                    <th className="p-4 text-[11px] font-serif italic uppercase text-zinc-500 tracking-wider">Status</th>
                    <th className="p-4 text-[11px] font-serif italic uppercase text-zinc-500 font-right tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  <AnimatePresence mode="popLayout">
                    {filteredContainers.map((container) => (
                      <motion.tr 
                        key={container.Id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-zinc-800/40 transition-all cursor-default"
                      >
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                              {container.Names[0].replace('/', '')}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[120px]">
                              {container.Id.substring(0, 12)}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Database className="w-3 h-3 text-zinc-600" />
                            <span className="text-xs font-mono text-zinc-400">{container.Image}</span>
                          </div>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center w-20">
                              <span className="text-[9px] text-zinc-600 font-mono">CPU</span>
                              <span className="text-[9px] text-zinc-400 font-mono">{container.State === 'running' ? '2.1%' : '0%'}</span>
                            </div>
                            <div className="w-20 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full bg-blue-500/50 ${container.State === 'running' ? 'w-[21%]' : 'w-0'}`} />
                            </div>
                            <div className="flex justify-between items-center w-20 mt-1">
                              <span className="text-[9px] text-zinc-600 font-mono">RAM</span>
                              <span className="text-[9px] text-zinc-400 font-mono">{container.State === 'running' ? '84MB' : '0MB'}</span>
                            </div>
                            <div className="w-20 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full bg-indigo-500/50 ${container.State === 'running' ? 'w-[42%]' : 'w-0'}`} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${container.State === 'running' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <span className="text-[11px] font-mono uppercase tracking-wider">{container.Status}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {container.State !== 'running' ? (
                              <button 
                                onClick={() => handleAction(container.Id, 'start')}
                                className="p-1.5 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded transition-all"
                                title="Start Container"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleAction(container.Id, 'stop')}
                                className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition-all"
                                title="Stop Container"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                            
                            <button 
                              onClick={() => handleAction(container.Id, 'restart')}
                              className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded transition-all"
                              title="Restart Container"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${container.State === 'running' ? 'group-hover:animate-spin' : ''}`} />
                            </button>

                            <button 
                              onClick={() => setInspectContainerId(container.Id)}
                              className="p-1.5 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded transition-all"
                              title="Inspect Container"
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setSelectedContainer(container.Id)}
                              className="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded transition-all"
                              title="View Logs"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setTerminalContainerId(container.Id)}
                              className={`p-1.5 rounded transition-all ${
                                container.State === 'running' 
                                  ? 'bg-zinc-500/10 text-zinc-400 hover:bg-zinc-700 hover:text-white' 
                                  : 'bg-zinc-800/10 text-zinc-700 cursor-not-allowed'
                              }`}
                              title={container.State === 'running' ? 'Open Terminal' : 'Container must be running'}
                              disabled={container.State !== 'running'}
                            >
                              <Monitor className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                    {filteredContainers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-zinc-600 font-mono text-xs">
                          NO_MATCHING_CONTAINERS_FOUND
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>

          {/* Sidebar: Audit Log */}
          <aside className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2 px-2">
              <Activity className="w-4 h-4" />
              Audit_Stream
            </h2>
            <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden divide-y divide-zinc-800 max-h-[600px] overflow-y-auto custom-scrollbar">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-xs">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  NO_RECORDS_FOUND
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log._id} className="p-4 hover:bg-zinc-800/30 transition-all flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.action === 'start' ? (
                          <Play className="w-2.5 h-2.5 text-green-500" />
                        ) : log.action === 'stop' ? (
                          <Square className="w-2.5 h-2.5 text-red-500" />
                        ) : (
                          <RefreshCw className="w-2.5 h-2.5 text-emerald-500" />
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          log.action === 'start' ? 'bg-green-500/10 text-green-500' : 
                          log.action === 'stop' ? 'bg-red-500/10 text-red-500' : 
                          'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {log.action.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-600">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-zinc-300 truncate">{log.containerName}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">ID: {log.containerId.substring(0, 8)}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </main>

      <AnimatePresence>
        {inspectContainerId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-4xl h-[70vh] bg-[#0c0c0c] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-mono text-sm text-zinc-300">
                    CONTAINER_INSPECT :: {containers.find(c => c.Id === inspectContainerId)?.Names[0].replace('/', '')}
                  </h3>
                </div>
                <button 
                  onClick={() => setInspectContainerId(null)}
                  className="p-1 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed custom-scrollbar bg-black/40">
                <pre className="text-emerald-500/80">
                  {JSON.stringify(containers.find(c => c.Id === inspectContainerId), null, 2)}
                </pre>
              </div>
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 text-center">
                <span className="text-[10px] text-zinc-600 font-mono">RAW_JSON_METADATA_VIEW // READ_ONLY</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log Modal */}
      <AnimatePresence>
        {selectedContainer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-5xl h-[80vh] bg-[#0c0c0c] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <Terminal className="w-5 h-5 text-blue-500" />
                  <h3 className="font-mono text-sm text-zinc-300">
                    LIVE_LOG_STREAM :: {containers.find(c => c.Id === selectedContainer)?.Names[0].replace('/', '')}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedContainer(null)}
                  className="p-1 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed custom-scrollbar bg-black/40">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-600 italic">
                    Waiting for output...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap border-l border-zinc-800 pl-4 mb-1 hover:bg-zinc-900/50 transition-colors py-0.5">
                      <span className="text-zinc-700 mr-4 tabular-nums">{(i + 1).toString().padStart(4, '0')}</span>
                      <span className={log.toLowerCase().includes('error') ? 'text-red-400' : 'text-zinc-400'}>
                        {log}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center px-6">
                <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
                   <div className="flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                     SOCKET_CONNECTED
                   </div>
                   <div>BUFFER_SIZE: {logs.length}/200</div>
                </div>
                <button 
                  onClick={() => setLogs([])}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase underline underline-offset-4"
                >
                  Clear_Buffer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {terminalContainerId && (
          <TerminalOverlay
            containerId={terminalContainerId}
            containerName={containers.find(c => c.Id === terminalContainerId)?.Names[0].replace('/', '') || 'Unknown'}
            onClose={() => setTerminalContainerId(null)}
          />
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}
