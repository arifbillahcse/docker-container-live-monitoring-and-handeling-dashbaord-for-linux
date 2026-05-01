import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { X, Command } from 'lucide-react';
import { motion } from 'motion/react';

interface TerminalOverlayProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export default function TerminalOverlay({ containerId, containerName, onClose }: TerminalOverlayProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d8',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // Initialize socket
    const socket = io();
    socketRef.current = socket;

    socket.emit('terminal-start', containerId);

    socket.on('terminal-data', (data: string) => {
      term.write(data);
    });

    term.onData((data) => {
      socket.emit('terminal-input', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal-resize', {
        cols: term.cols,
        rows: term.rows,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial resize notify

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
    };
  }, [containerId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-6xl h-[85vh] bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-zinc-800 rounded border border-zinc-700">
              <Command className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <h3 className="font-mono text-sm text-zinc-300">
                CONTAINERSH_V1.0 // EXEC :: {containerName}
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono">ID: {containerId.substring(0, 12)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 bg-black p-4 relative">
          <div ref={terminalRef} className="h-full w-full" />
        </div>
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center px-6 text-[10px] text-zinc-600 font-mono">
          <div className="flex gap-4">
            <span>SHELL_INIT: /bin/sh</span>
            <span>TTY_EMULATION: XTERM.JS</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-blue-500 animate-ping" />
            READY_FOR_INPUT
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
