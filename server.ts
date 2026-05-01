import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Docker from 'dockerode';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arifbillah360:tIW4vnFYbZOePggN@cluster0.vf75phg.mongodb.net/?appName=Cluster0';

// MongoDB Schema
const auditLogSchema = new mongoose.Schema({
  containerId: String,
  containerName: String,
  action: String,
  timestamp: { type: Date, default: Date.now },
  status: String,
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Docker Setup with Mock Fallback for Preview Environment
let docker: any;
let isMock = false;

async function initDocker() {
  try {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    // Test connection
    await docker.ping();
    console.log('Connected to Docker daemon');
  } catch (err) {
    console.warn('Docker daemon not found or inaccessible. Switched to Mock Mode.');
    isMock = true;
    
    // Minimal Mock Implementation for Previewing the UI
    const mockContainers = [
      { Id: 'c1', Names: ['/web-server'], Image: 'nginx:latest', State: 'running', Status: 'Up 2 hours' },
      { Id: 'c2', Names: ['/db-mongo'], Image: 'mongo:4.4', State: 'exited', Status: 'Exited (0) 5 days ago' },
      { Id: 'c3', Names: ['/api-service'], Image: 'node:18-alpine', State: 'running', Status: 'Up 45 minutes' },
    ];

    docker = {
      listContainers: (opts: any) => Promise.resolve(mockContainers),
      getContainer: (id: string) => ({
        start: () => {
          const c = mockContainers.find(x => x.Id === id);
          if (c) c.State = 'running';
          return Promise.resolve();
        },
        stop: () => {
          const c = mockContainers.find(x => x.Id === id);
          if (c) c.State = 'exited';
          return Promise.resolve();
        },
        logs: (opts: any) => {
          const stream = new Readable();
          stream._read = () => {};
          setInterval(() => {
            stream.push(`[MOCK LOG] ${new Date().toISOString()} - Sample log entry for container ${id}\n`);
          }, 1000);
          return Promise.resolve(stream);
        },
        inspect: () => {
          const c = mockContainers.find(x => x.Id === id);
          return Promise.resolve(c || { Names: ['/unknown'] });
        }
      }),
      ping: () => Promise.resolve('OK')
    };
  }
}

async function startServer() {
  await initDocker();
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(cors());
  app.use(express.json());

  // Connect to MongoDB (Optional fail-fast for preview)
  mongoose.connect(MONGODB_URI).catch(err => {
    console.warn('MongoDB connection failed. Audit logging will be disabled in this session.');
  });

  // API Routes
  app.get('/api/containers', async (req, res) => {
    try {
      const containers = await docker.listContainers({ all: true });
      res.json(containers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list containers' });
    }
  });

  app.post('/api/containers/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    try {
      const container = docker.getContainer(id);
      
      if (action === 'start') await container.start();
      else if (action === 'stop') await container.stop();
      else if (action === 'restart') await container.restart();
      else return res.status(400).json({ error: 'Invalid action' });

      // Log to DB
      try {
        const info = isMock ? { Names: ['/mock-container'] } : await container.inspect();
        await AuditLog.create({
          containerId: id,
          containerName: isMock ? info.Names[0] : info.Name.replace('/', ''),
          action,
          status: 'success'
        });
      } catch (logErr) {
        console.error('Audit logging failed:', logErr);
      }

      res.json({ message: `Container ${action}ed successfully` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/logs', async (req, res) => {
     try {
       const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(50);
       res.json(logs);
     } catch (error) {
       res.status(500).json({ error: 'Failed to fetch audit logs' });
     }
  });

  // Socket.io for Real-time Logs
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('stream-logs', async (containerId) => {
      console.log('Streaming logs for:', containerId);
      try {
        const container = docker.getContainer(containerId);
        const logStream = await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          tail: 100
        });

        logStream.on('data', (chunk: Buffer) => {
          socket.emit('log-data', chunk.toString('utf8'));
        });

        socket.on('disconnect', () => {
          if (logStream.destroy) logStream.destroy();
        });
      } catch (err) {
        socket.emit('log-error', 'Failed to stream logs');
      }
    });

    // Terminal Execution Support
    socket.on('terminal-start', async (containerId) => {
      console.log('Starting terminal session for:', containerId);
      try {
        if (isMock) {
          socket.emit('terminal-data', `\r\n[MOCK MODE] Connected to ${containerId} shell.\r\n$ `);
          socket.on('terminal-input', (data) => {
            if (data === '\r') socket.emit('terminal-data', '\r\n$ ');
            else socket.emit('terminal-data', data);
          });
          return;
        }

        const container = docker.getContainer(containerId);
        const exec = await container.exec({
          Cmd: ['/bin/sh'],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
        });

        const stream = await exec.start({ stdin: true, hijack: true });

        stream.on('data', (chunk: Buffer) => {
          socket.emit('terminal-data', chunk.toString('utf8'));
        });

        socket.on('terminal-input', (data) => {
          stream.write(data);
        });

        socket.on('terminal-resize', ({ cols, rows }) => {
          exec.resize({ w: cols, h: rows }).catch(console.error);
        });

        socket.on('disconnect', () => {
          if (stream.destroy) stream.destroy();
        });
      } catch (err) {
        console.error('Terminal error:', err);
        socket.emit('terminal-data', '\r\nError connecting to terminal: ' + (err as Error).message);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log('Starting in DEVELOPMENT mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    console.log('Starting in PRODUCTION mode...');
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files from the dist directory
    app.use(express.static(distPath));
    
    // Fallback for SPA routing
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Production build not found. Please run npm run build.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (isMock) console.log('RUNNING IN MOCK MODE (UI PREVIEW)');
  });
}

startServer();
