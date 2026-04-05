import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { 
  Upload, 
  FileAudio, 
  X, 
  Download, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Music,
  Trash2,
  Settings2,
  FileVideo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatBytes } from '@/lib/utils';

interface FileProgress {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  outputUrl?: string;
  outputName?: string;
}

export default function App() {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bitrate, setBitrate] = useState('192k');
  const ffmpegRef = useRef(new FFmpeg());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      setEngineState('loading');
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setEngineState('ready');
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
      setLoadError(`Failed to load conversion engine. Please check your internet connection. Details: ${err instanceof Error ? err.message : String(err)}`);
      setEngineState('error');
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        progress: 0,
        status: 'pending' as const,
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    if (isProcessing) return;
    setFiles([]);
  };

  const convertFile = async (fileProgress: FileProgress) => {
    const ffmpeg = ffmpegRef.current;
    const safeInputName = fileProgress.file.name;
    const outputName = safeInputName.replace(/\.[^/.]+$/, "") + ".mp3";
    let usedMount = false;

    try {
      setFiles(prev => prev.map(f => 
        f.id === fileProgress.id ? { ...f, status: 'processing', progress: 0, error: undefined } : f
      ));

      // Try mounting first (better for large files, avoids loading into RAM)
      try {
        await ffmpeg.mount('WORKERFS', { files: [fileProgress.file] }, '/mnt');
        usedMount = true;
      } catch (e) {
        console.warn('WORKERFS mount failed, falling back to writeFile', e);
        await ffmpeg.writeFile(safeInputName, await fetchFile(fileProgress.file));
      }

      const inputPath = usedMount ? `/mnt/${safeInputName}` : safeInputName;

      ffmpeg.on('progress', ({ progress }) => {
        setFiles(prev => prev.map(f => 
          f.id === fileProgress.id ? { ...f, progress: Math.round(progress * 100) } : f
        ));
      });

      const code = await ffmpeg.exec(['-i', inputPath, '-vn', '-ab', bitrate, '-ar', '44100', '-f', 'mp3', outputName]);
      
      if (code !== 0) {
        throw new Error(`FFmpeg exited with code ${code}`);
      }

      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'audio/mp3' }));

      setFiles(prev => prev.map(f => 
        f.id === fileProgress.id ? { ...f, status: 'completed', progress: 100, outputUrl: url, outputName } : f
      ));

    } catch (err) {
      console.error(`Error converting ${safeInputName}:`, err);
      setFiles(prev => prev.map(f => 
        f.id === fileProgress.id ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Conversion failed' } : f
      ));
    } finally {
      // Cleanup
      try {
        if (usedMount) {
          await ffmpeg.unmount('/mnt');
        } else {
          await ffmpeg.deleteFile(safeInputName);
        }
        await ffmpeg.deleteFile(outputName);
      } catch (cleanupErr) {
        console.warn('Cleanup error:', cleanupErr);
      }
    }
  };

  const startBatchConversion = async () => {
    if (engineState !== 'ready' || isProcessing) return;
    
    setIsProcessing(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    
    for (const file of pendingFiles) {
      await convertFile(file);
    }
    
    setIsProcessing(false);
  };

  const downloadAll = () => {
    files.forEach(f => {
      if (f.outputUrl && f.outputName) {
        const link = document.createElement('a');
        link.href = f.outputUrl;
        link.download = f.outputName;
        link.click();
      }
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-blue-500/30">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-3 bg-blue-600/10 rounded-2xl mb-6 border border-blue-500/20"
          >
            <Music className="w-8 h-8 text-blue-500" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent"
          >
            MP4 to MP3 Batch Converter
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-neutral-400 text-lg max-w-xl mx-auto"
          >
            High-performance, browser-based batch conversion. No uploads required. 
            Perfect for large files up to 2GB.
          </motion.p>
        </header>

        {loadError && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="shrink-0" />
            <p className="text-sm">{loadError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center border-dashed hover:border-blue-500/50 transition-colors group relative overflow-hidden">
            <input 
              type="file" 
              multiple 
              accept="video/mp4,video/x-m4v,video/*,audio/*" 
              onChange={onFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="flex flex-col items-center gap-4 text-neutral-400 group-hover:text-blue-400 transition-colors">
              <div className="p-4 bg-neutral-800 rounded-full group-hover:bg-blue-500/10 transition-colors">
                <Upload className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="font-medium text-neutral-200">Click or drag files to upload</p>
                <p className="text-sm">MP4, MOV, AVI, ecc.</p>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-neutral-300 font-medium">
              <Settings2 className="w-4 h-4" />
              <span>Output Settings</span>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 uppercase tracking-wider font-bold">Audio Bitrate</label>
              <select 
                value={bitrate}
                onChange={(e) => setBitrate(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              >
                <option value="128k">128 kbps (Standard)</option>
                <option value="192k">192 kbps (High)</option>
                <option value="256k">256 kbps (Very High)</option>
                <option value="320k">320 kbps (Extreme)</option>
              </select>
            </div>
            <div className="mt-auto pt-4 border-t border-neutral-800 flex gap-2">
              <button 
                onClick={clearAll}
                disabled={files.length === 0 || isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-12">
          <AnimatePresence mode="popLayout">
            {files.map((file) => (
              <motion.div
                key={file.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-lg shrink-0",
                    file.status === 'completed' ? "bg-green-500/10 text-green-500" : "bg-neutral-800 text-neutral-400"
                  )}>
                    {file.status === 'completed' ? <FileAudio className="w-6 h-6" /> : <FileVideo className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-medium truncate text-neutral-200">{file.file.name}</h3>
                      <span className="text-xs text-neutral-500 shrink-0">{formatBytes(file.file.size)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {file.status === 'processing' && (
                        <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Converting... {file.progress}%
                        </div>
                      )}
                      {file.status === 'completed' && (
                        <div className="flex items-center gap-2 text-xs text-green-500 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready to download
                        </div>
                      )}
                      {file.status === 'pending' && (
                        <div className="text-xs text-neutral-500">Waiting in queue</div>
                      )}
                      {file.status === 'error' && (
                        <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
                          <AlertCircle className="w-3 h-3" />
                          <span className="truncate max-w-[200px] sm:max-w-md" title={file.error}>{file.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file.outputUrl ? (
                      <a 
                        href={file.outputUrl} 
                        download={file.outputName}
                        className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                      >
                        <Download className="w-5 h-5" />
                      </a>
                    ) : (
                      <button 
                        onClick={() => removeFile(file.id)}
                        disabled={isProcessing}
                        className="p-2 hover:bg-neutral-800 text-neutral-500 hover:text-red-400 rounded-lg transition-colors disabled:opacity-0"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                {file.status === 'processing' && (
                  <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {files.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-neutral-800 rounded-3xl">
              <p className="text-neutral-500">Nessun file selezionato</p>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-50"
          >
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl flex items-center gap-4">
              {files.some(f => f.status === 'completed') ? (
                <button 
                  onClick={downloadAll}
                  className="flex-1 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-3 rounded-xl font-semibold transition-all active:scale-95"
                >
                  <Download className="w-5 h-5" />
                  Download All
                </button>
              ) : null}
              
              <button 
                onClick={startBatchConversion}
                disabled={engineState !== 'ready' || isProcessing || !files.some(f => f.status === 'pending' || f.status === 'error')}
                className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-3 rounded-xl font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                {engineState === 'loading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading Engine...
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Start Conversion
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
