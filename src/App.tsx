/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Music, 
  Zap, 
  Upload, 
  Save, 
  FolderOpen, 
  Trash2, 
  Edit2,
  Check,
  X,
  Plus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FileAudio,
  Search,
  MoreVertical,
  Settings2,
  Sun,
  Moon,
  Github,
  ListMusic,
  Repeat,
  Repeat1,
  SkipForward,
  SkipBack,
  Headphones,
  StopCircle,
  Download,
  PackageOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LibraryFile, type Folder } from './db';
import { apiService } from './services/apiService';

interface AudioSlot {
  id: string;
  name: string;
  url: string | null;
  fileId: number | null;
  volume: number;
  isPlaying: boolean;
  isLooping: boolean;
  playMode?: 'once' | 'twice' | 'loop';
}

const INITIAL_MUSIC_TRACKS: AudioSlot[] = Array.from({ length: 6 }, (_, i) => ({
  id: `music-${i}`,
  name: `Track ${i + 1}`,
  url: null,
  fileId: null,
  volume: 0.5,
  isPlaying: false,
  isLooping: true,
}));

const INITIAL_SFX_SLOTS: AudioSlot[] = Array.from({ length: 20 }, (_, i) => ({
  id: `sfx-${i}`,
  name: `SFX ${i + 1}`,
  url: null,
  fileId: null,
  volume: 0.7,
  isPlaying: false,
  isLooping: false,
  playMode: 'once',
}));

const DEFAULT_BGS = {
  dark: [
    { name: 'None (Black)', url: 'none' },
    { name: 'Dungeon', url: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.wallpapersafari.com%2F57%2F65%2FOsiGAP.jpg&f=1&nofb=1&ipt=8ffb78e8015adf2078de7390fdf6eb87d4a18c26c9dd27e92e4eb062db811213' },
    { name: 'D20', url: 'https://wallpapercave.com/wp/wp5902133.jpg' },
    { name: 'Night Forest', url: 'https://images.wallpapersden.com/image/download/dungeons-and-dragons-monster-manual_bGhtamqUmZqaraWkpJRmbmdlrWZlbWU.jpg' },
  ],
  light: [
    { name: 'None (White)', url: 'none' },
    { name: 'Icey', url: 'https://wallpapercave.com/wp/wp5901984.jpg' },
    { name: 'D20 Red', url: 'https://wallpapercave.com/wp/wp5902153.jpg' },
    { name: 'Crit', url: 'https://wallpapercave.com/wp/wp4786861.jpg' },
  ]
};

declare global {
  interface Window {
    electron?: any;
  }
}

export default function App() {
  const [musicTracks, setMusicTracks] = useState<AudioSlot[]>(INITIAL_MUSIC_TRACKS);
  const [sfxSlots, setSfxSlots] = useState<AudioSlot[]>(INITIAL_SFX_SLOTS);
  const [masterMusicVolume, setMasterMusicVolume] = useState(0.8);
  const [masterSfxVolume, setMasterSfxVolume] = useState(0.8);
  
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [targetSlotId, setTargetSlotId] = useState<{ id: string, isMusic: boolean } | null>(null);

  // Playlist mode state
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [playlistLoopMode, setPlaylistLoopMode] = useState<'off' | 'all' | 'track'>('all');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const [savedSets, setSavedSets] = useState<string[]>([]);
  const [currentSetName, setCurrentSetName] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [bgImage, setBgImage] = useState<string>('none');
  const [customBgs, setCustomBgs] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<'all' | 'music' | 'sfx'>('all');
  const [storagePath, setStoragePath] = useState('');
  const [newPathInput, setNewPathInput] = useState('');
  const [backupStatus, setBackupStatus] = useState<{ type: 'idle' | 'working' | 'ok' | 'error'; msg: string }>({ type: 'idle', msg: '' });

  // Audio Refs
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  const [dbStatus, setDbStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const initDb = async () => {
      try {
        await db.open();
        console.log('[DB] Database opened successfully');
        setDbStatus('ok');
      } catch (err) {
        console.error('[DB] Failed to open database on startup:', err);
        setDbStatus('error');
        alert("Database error detected. If your library is empty, please try 'Reset Internal Database' in Settings.");
      }
    };
    initDb();

    const sets = JSON.parse(localStorage.getItem('harmonicon_sets') || '[]');
    setSavedSets(sets);
    const savedTheme = localStorage.getItem('harmonicon_theme') as 'light' | 'dark';
    if (savedTheme) setTheme(savedTheme);
    
    const savedBg = localStorage.getItem('harmonicon_bg');
    if (savedBg) setBgImage(savedBg);
    const savedCustomBgs = JSON.parse(localStorage.getItem('harmonicon_custom_bgs') || '[]');
    setCustomBgs(savedCustomBgs);
    
    // Fetch storage path
    apiService.getConfig()
      .then(data => {
        setStoragePath(data.storagePath);
        setNewPathInput(data.storagePath);
      });

    // Load last session
    const loadLastSession = async () => {
      const lastSession = localStorage.getItem('harmonicon_last_session');
      if (lastSession) {
        const config = JSON.parse(lastSession);
        
        const loadFile = async (fileId: number | null) => {
          if (!fileId) return null;
          const file = await db.files.get(fileId);
          if (!file) return null;
          // Migration: Convert old /uploads/ paths to media:/
          if (file.serverPath.startsWith('/uploads/')) {
            return file.serverPath.replace('/uploads/', 'media:/');
          }
          return file.serverPath;
        };

        const newMusic = await Promise.all((config.musicTracks || []).map(async (saved: any) => {
          const url = await loadFile(saved.fileId);
          return { 
            id: saved.id, 
            name: saved.name, 
            volume: saved.volume, 
            fileId: saved.fileId, 
            url, 
            isPlaying: false,
            isLooping: true 
          };
        }));

        const newSfx = await Promise.all((config.sfxSlots || []).map(async (saved: any) => {
          const url = await loadFile(saved.fileId);
          return { 
            id: saved.id, 
            name: saved.name, 
            volume: saved.volume, 
            fileId: saved.fileId, 
            url, 
            isPlaying: false, 
            isLooping: saved.playMode === 'loop',
            playMode: saved.playMode || 'once' 
          };
        }));

        if (newMusic.length > 0) setMusicTracks(newMusic);
        if (newSfx.length > 0) setSfxSlots(newSfx);
        if (config.masterMusicVolume !== undefined) setMasterMusicVolume(config.masterMusicVolume);
        if (config.masterSfxVolume !== undefined) setMasterSfxVolume(config.masterSfxVolume);
      }
    };
    loadLastSession();
  }, []);

  // Auto-save last session
  useEffect(() => {
    const config = {
      musicTracks: musicTracks.map(t => ({ id: t.id, name: t.name, volume: t.volume, fileId: t.fileId })),
      sfxSlots: sfxSlots.map(s => ({ id: s.id, name: s.name, volume: s.volume, fileId: s.fileId, playMode: s.playMode })),
      masterMusicVolume,
      masterSfxVolume
    };
    localStorage.setItem('harmonicon_last_session', JSON.stringify(config));
  }, [musicTracks, sfxSlots, masterMusicVolume, masterSfxVolume]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('harmonicon_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('harmonicon_bg', bgImage);
  }, [bgImage]);

  useEffect(() => {
    localStorage.setItem('harmonicon_custom_bgs', JSON.stringify(customBgs));
  }, [customBgs]);

  const updateStoragePath = async () => {
    try {
      const data = await apiService.setConfig(newPathInput);
      if (data.success) {
        setStoragePath(data.storagePath);
        setIsSettingsOpen(false);
      }
    } catch (e) {
      console.error("Failed to update storage path", e);
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await apiService.uploadFile(file);
      
      if (data.success) {
        setCustomBgs(prev => [...prev, data.path]);
        setBgImage(data.path);
      }
    } catch (e) {
      console.error("BG Upload failed", e);
    }
  };

  // ── Backup / Restore ──────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!(window as any).electron) {
      alert('Export is only available in the desktop app.');
      return;
    }
    setBackupStatus({ type: 'working', msg: 'Building backup archive…' });
    try {
      // Snapshot all harmonicon_ localStorage keys
      const localStorageData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith('harmonicon_')) localStorageData[key] = localStorage.getItem(key)!;
      }
      // Dump Dexie tables
      const [folders, files] = await Promise.all([db.folders.toArray(), db.files.toArray()]);
      const result = await apiService.exportSettings(localStorageData, { folders, files });
      if (result.canceled) {
        setBackupStatus({ type: 'idle', msg: '' });
      } else if (result.error) {
        setBackupStatus({ type: 'error', msg: result.error });
      } else {
        setBackupStatus({ type: 'ok', msg: `Exported ${result.fileCount} files → ${result.filePath}` });
      }
    } catch (err: any) {
      setBackupStatus({ type: 'error', msg: err.message });
    }
  };

  const handleImport = async () => {
    if (!(window as any).electron) {
      alert('Import is only available in the desktop app.');
      return;
    }
    if (!confirm('Importing will overwrite your current library, presets, and settings. Audio files already on disk will be merged. Continue?')) return;
    setBackupStatus({ type: 'working', msg: 'Restoring backup…' });
    try {
      const result = await apiService.importSettings();
      if (result.canceled) {
        setBackupStatus({ type: 'idle', msg: '' });
        return;
      }
      if (result.error) {
        setBackupStatus({ type: 'error', msg: result.error });
        return;
      }
      const { manifest, fileCount } = result;

      // Restore localStorage
      if (manifest.localStorage) {
        for (const [key, value] of Object.entries(manifest.localStorage)) {
          localStorage.setItem(key, value as string);
        }
      }

      // Restore DB — clear tables then re-insert
      await db.folders.clear();
      await db.files.clear();
      if (manifest.db?.folders?.length) {
        for (const folder of manifest.db.folders) {
          // Preserve original id so file.folderId references stay valid
          await db.folders.put(folder);
        }
      }
      if (manifest.db?.files?.length) {
        for (const file of manifest.db.files) {
          await db.files.put(file);
        }
      }

      setBackupStatus({ type: 'ok', msg: `Restored ${fileCount} files. Reloading…` });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setBackupStatus({ type: 'error', msg: err.message });
    }
  };

  const toggleAll = (isMusic: boolean) => {
    const tracks = isMusic ? musicTracks : sfxSlots;
    const anyPlaying = tracks.some(t => t.isPlaying);
    
    if (isMusic && isPlaylistMode) {
      // In playlist mode, play/pause just the first playable track
      const playableTracks = musicTracks.filter(t => t.url);
      const currentPlaying = musicTracks.find(t => t.isPlaying);
      if (currentPlaying) {
        // Pause it
        const audio = audioRefs.current[currentPlaying.id];
        if (audio) audio.pause();
        setMusicTracks(prev => prev.map(t => t.id === currentPlaying.id ? { ...t, isPlaying: false } : t));
      } else if (playableTracks.length > 0) {
        // Start first playable
        const first = playableTracks[0];
        const audio = audioRefs.current[first.id];
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
        setMusicTracks(prev => prev.map(t => ({ ...t, isPlaying: t.id === first.id && !!t.url })));
      }
      return;
    }

    tracks.forEach(track => {
      if (!track.url) return;
      const audio = audioRefs.current[track.id];
      if (!audio) return;
      
      if (anyPlaying) {
        audio.pause();
      } else {
        audio.play().catch(e => console.error("Playback failed", e));
      }
    });

    if (isMusic) {
      setMusicTracks(prev => prev.map(t => t.url ? { ...t, isPlaying: !anyPlaying } : t));
    } else {
      setSfxSlots(prev => prev.map(s => s.url ? { ...s, isPlaying: !anyPlaying } : s));
    }
  };

  const togglePlay = (id: string, isMusic: boolean) => {
    const tracks = isMusic ? musicTracks : sfxSlots;
    const track = tracks.find(t => t.id === id);
    if (!track || !track.url) return;

    const audio = audioRefs.current[id];
    if (!audio) {
      console.error(`[Playback] Audio ref not found for ID: ${id}`);
      return;
    }

    console.log(`[Playback] Toggling ${isMusic ? 'Music' : 'SFX'}: ${track.name} (${track.url})`);

    if (isMusic && isPlaylistMode) {
      if (track.isPlaying) {
        // Pause current
        audio.pause();
        setMusicTracks(prev => prev.map(t => t.id === id ? { ...t, isPlaying: false } : t));
      } else {
        // Stop all others first, then start this one
        musicTracks.forEach(t => {
          if (t.id !== id && t.isPlaying) {
            const a = audioRefs.current[t.id];
            if (a) { a.pause(); a.currentTime = 0; }
          }
        });
        audio.currentTime = 0;
        audio.play().catch(e => console.error("Playback failed", e));
        setMusicTracks(prev => prev.map(t => ({ ...t, isPlaying: t.id === id && !!t.url })));
      }
      return;
    }

    if (track.isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(e => console.error("Playback failed", e));
    }

    if (isMusic) {
      setMusicTracks(prev => prev.map(t => t.id === id ? { ...t, isPlaying: !t.isPlaying } : t));
    } else {
      setSfxSlots(prev => prev.map(s => s.id === id ? { ...s, isPlaying: !s.isPlaying } : s));
    }
  };

  const updateVolume = (id: string, volume: number, isMusic: boolean) => {
    if (isMusic) {
      setMusicTracks(prev => prev.map(t => t.id === id ? { ...t, volume } : t));
    } else {
      setSfxSlots(prev => prev.map(s => s.id === id ? { ...s, volume } : s));
    }
  };

  const resetAll = (isMusic: boolean) => {
    if (isMusic) {
      musicTracks.forEach(t => {
        if (audioRefs.current[t.id]) {
          audioRefs.current[t.id].pause();
          audioRefs.current[t.id].currentTime = 0;
        }
      });
      setMusicTracks(prev => prev.map(t => ({ ...t, isPlaying: false })));
    } else {
      sfxSlots.forEach(s => {
        if (audioRefs.current[s.id]) {
          audioRefs.current[s.id].pause();
          audioRefs.current[s.id].currentTime = 0;
        }
      });
      setSfxSlots(prev => prev.map(s => ({ ...s, isPlaying: false })));
    }
  };

  const addMusicTrack = () => {
    const newId = `music-${Date.now()}`;
    const newTrack: AudioSlot = {
      id: newId,
      name: `Track ${musicTracks.length + 1}`,
      url: null,
      fileId: null,
      volume: 0.5,
      isPlaying: false,
      isLooping: true,
      playMode: 'loop'
    };
    setMusicTracks(prev => [...prev, newTrack]);
  };

  const addSfxSlot = () => {
    const newId = `sfx-${Date.now()}`;
    const newSlot: AudioSlot = {
      id: newId,
      name: `SFX ${sfxSlots.length + 1}`,
      url: null,
      fileId: null,
      volume: 0.7,
      isPlaying: false,
      isLooping: false,
      playMode: 'once'
    };
    setSfxSlots(prev => [...prev, newSlot]);
  };

  const updatePlayMode = (id: string, playMode: 'once' | 'twice' | 'loop') => {
    setSfxSlots(prev => prev.map(s => s.id === id ? { ...s, playMode, isLooping: playMode === 'loop' } : s));
  };

  const toggleMusicLoop = (id: string) => {
    setMusicTracks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const newLooping = !t.isLooping;
      const audio = audioRefs.current[id];
      if (audio) audio.loop = newLooping;
      return { ...t, isLooping: newLooping };
    }));
  };

  const handleMusicTrackEnded = useCallback((id: string) => {
    if (!isPlaylistMode) return;

    const playableTracks = musicTracks.filter(t => t.url);
    const currentIndex = playableTracks.findIndex(t => t.id === id);

    if (playlistLoopMode === 'track') {
      // Restart same track
      const audio = audioRefs.current[id];
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
      return;
    }

    // Stop current track in state
    setMusicTracks(prev => prev.map(t => t.id === id ? { ...t, isPlaying: false } : t));

    const nextIndex = currentIndex + 1;
    if (nextIndex < playableTracks.length) {
      // Play next track
      const nextTrack = playableTracks[nextIndex];
      const audio = audioRefs.current[nextTrack.id];
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
      setMusicTracks(prev => prev.map(t => t.id === nextTrack.id ? { ...t, isPlaying: true } : t));
    } else if (playlistLoopMode === 'all' && playableTracks.length > 0) {
      // Loop back to first
      const firstTrack = playableTracks[0];
      const audio = audioRefs.current[firstTrack.id];
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
      setMusicTracks(prev => prev.map(t => t.id === firstTrack.id ? { ...t, isPlaying: true } : t));
    }
    // if 'off' and at end, just stop (state already updated above)
  }, [isPlaylistMode, playlistLoopMode, musicTracks, audioRefs]);

  const handleReset = (type: 'count' | 'files' | 'both') => {
    const resetMusic = resetTarget === 'all' || resetTarget === 'music';
    const resetSfx = resetTarget === 'all' || resetTarget === 'sfx';

    if (resetMusic) {
      musicTracks.forEach(t => {
        if (audioRefs.current[t.id]) {
          audioRefs.current[t.id].pause();
          audioRefs.current[t.id].currentTime = 0;
        }
      });
      
      if (type === 'count' || type === 'both') {
        setMusicTracks(INITIAL_MUSIC_TRACKS);
      } else if (type === 'files') {
        setMusicTracks(prev => prev.map(t => ({ ...t, url: null, fileId: null, isPlaying: false })));
      }
    }

    if (resetSfx) {
      sfxSlots.forEach(s => {
        if (audioRefs.current[s.id]) {
          audioRefs.current[s.id].pause();
          audioRefs.current[s.id].currentTime = 0;
        }
      });

      if (type === 'count' || type === 'both') {
        setSfxSlots(INITIAL_SFX_SLOTS);
      } else if (type === 'files') {
        setSfxSlots(prev => prev.map(s => ({ ...s, url: null, fileId: null, isPlaying: false })));
      }
    }

    setIsResetModalOpen(false);
  };

  const openResetModal = (target: 'all' | 'music' | 'sfx') => {
    setResetTarget(target);
    setIsResetModalOpen(true);
  };

  const openLibraryForSlot = (id: string, isMusic: boolean) => {
    setTargetSlotId({ id, isMusic });
    setIsLibraryOpen(true);
  };

  const assignFileToSlot = async (file: LibraryFile) => {
    if (!targetSlotId) return;
    const url = file.serverPath;
    
    if (targetSlotId.isMusic) {
      setMusicTracks(prev => prev.map(t => t.id === targetSlotId.id ? { ...t, url, fileId: file.id!, name: file.name } : t));
    } else {
      setSfxSlots(prev => prev.map(s => s.id === targetSlotId.id ? { ...s, url, fileId: file.id!, name: file.name } : s));
    }
    setIsLibraryOpen(false);
    setTargetSlotId(null);
  };

  const saveConfiguration = () => {
    if (!currentSetName) return;
    const config = {
      musicTracks: musicTracks.map(t => ({ id: t.id, name: t.name, volume: t.volume, fileId: t.fileId })),
      sfxSlots: sfxSlots.map(s => ({ id: s.id, name: s.name, volume: s.volume, fileId: s.fileId, playMode: s.playMode })),
      masterMusicVolume,
      masterSfxVolume
    };
    localStorage.setItem(`harmonicon_set_${currentSetName}`, JSON.stringify(config));
    if (!savedSets.includes(currentSetName)) {
      const newSets = [...savedSets, currentSetName];
      setSavedSets(newSets);
      localStorage.setItem('harmonicon_sets', JSON.stringify(newSets));
    }
  };

  const loadConfiguration = async (name: string) => {
    const configStr = localStorage.getItem(`harmonicon_set_${name}`);
    if (!configStr) return;
    const config = JSON.parse(configStr);
    
    // Helper to load file and create URL
    const loadFile = async (fileId: number | null) => {
      if (!fileId) return null;
      const file = await db.files.get(fileId);
      if (!file) return null;
      // Migration: Convert old /uploads/ paths to media:/
      if (file.serverPath.startsWith('/uploads/')) {
        return file.serverPath.replace('/uploads/', 'media:/');
      }
      return file.serverPath;
    };

    const newMusic = await Promise.all(config.musicTracks.map(async (saved: any) => {
      const url = await loadFile(saved.fileId);
      return { 
        id: saved.id, 
        name: saved.name, 
        volume: saved.volume, 
        fileId: saved.fileId, 
        url, 
        isPlaying: false,
        isLooping: true
      };
    }));

    const newSfx = await Promise.all(config.sfxSlots.map(async (saved: any) => {
      const url = await loadFile(saved.fileId);
      return { 
        id: saved.id, 
        name: saved.name, 
        volume: saved.volume, 
        fileId: saved.fileId, 
        url, 
        isPlaying: false, 
        isLooping: saved.playMode === 'loop',
        playMode: saved.playMode || 'once' 
      };
    }));

    setMusicTracks(newMusic);
    setSfxSlots(newSfx);
    setMasterMusicVolume(config.masterMusicVolume);
    setMasterSfxVolume(config.masterSfxVolume);
    setCurrentSetName(name);
  };

  const deleteSet = (name: string) => {
    localStorage.removeItem(`harmonicon_set_${name}`);
    const newSets = savedSets.filter(s => s !== name);
    setSavedSets(newSets);
    localStorage.setItem('harmonicon_sets', JSON.stringify(newSets));
  };

  return (
    <div 
      className="flex flex-col min-h-screen relative overflow-x-hidden"
      style={{
        backgroundImage: bgImage !== 'none' ? `url(${bgImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Background Overlay for readability */}
      {bgImage !== 'none' && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 pointer-events-none z-0" />
      )}

      {/* Header */}
      <header className="glass-panel rounded-none border-x-0 border-t-0 py-6 px-8 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold/10 border border-gold/30 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://picsum.photos/seed/harmonicon/100/100";
              }}
            />
          </div>
          <div>
            <h1 className="text-3xl font-display text-gold gold-glow">Harmonicon</h1>
            <p className="text-[12px] tracking-[0.4em] text-theme-muted uppercase font-bold">TTRPG Sound Panel</p>
          </div>
        </div>
        
        <div className="flex items-center gap-12">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest text-theme-muted font-bold">Music Master</span>
            <div className="flex items-center gap-3">
              <VolumeX size={14} className="text-theme-muted/50" />
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={masterMusicVolume} 
                onChange={(e) => setMasterMusicVolume(parseFloat(e.target.value))}
                className="w-48 h-1.5"
              />
              <Volume2 size={14} className="text-gold" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest text-theme-muted font-bold">SFX Master</span>
            <div className="flex items-center gap-3">
              <VolumeX size={14} className="text-theme-muted/50" />
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={masterSfxVolume} 
                onChange={(e) => setMasterSfxVolume(parseFloat(e.target.value))}
                className="w-48 h-1.5"
              />
              <Volume2 size={14} className="text-gold" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-theme-muted hover:text-gold transition-all"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-theme-muted hover:text-gold transition-all"
              title="Settings"
            >
              <Settings2 size={20} />
            </button>
          </div>
          <button 
            onClick={() => openResetModal('all')}
            className="flex flex-col items-center gap-1 group"
            title="Reset All"
          >
            <div className="w-10 h-10 rounded-full border border-blood/40 flex items-center justify-center group-hover:bg-blood/20 transition-all text-theme-muted group-hover:text-blood">
              <RotateCcw size={16} />
            </div>
            <span className="text-[8px] uppercase tracking-widest font-bold text-theme-muted group-hover:text-blood">Reset All</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-screen-2xl mx-auto w-full grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Music Section */}
        <section className="xl:col-span-6 space-y-6">
          <div className="glass-panel px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl text-gold flex items-center gap-3 font-display">
                <Music size={20} className="text-gold/60" /> Music Tracks
              </h2>
              <button 
                onClick={addMusicTrack}
                className="p-1.5 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg transition-all"
                title="Add Music Track"
              >
                <Plus size={14} />
              </button>
              {/* Playlist Mode Toggle */}
              <button
                onClick={() => setIsPlaylistMode(p => !p)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${
                  isPlaylistMode 
                    ? 'bg-gold/20 border-gold/40 text-gold' 
                    : 'bg-white/5 border-white/10 text-theme-muted hover:text-gold'
                }`}
                title="Toggle Playlist Mode"
              >
                <ListMusic size={12} />
                {isPlaylistMode ? 'Playlist' : 'Playlist'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              {/* Playlist loop mode — single cycling button, same compact style as the per-track loop toggle */}
              {isPlaylistMode && (
                <button
                  onClick={() => setPlaylistLoopMode(m => m === 'off' ? 'all' : m === 'all' ? 'track' : 'off')}
                  className="flex flex-col items-center gap-0.5 px-2 border-l border-white/5 text-gold transition-all hover:opacity-80"
                  title={playlistLoopMode === 'off' ? 'No loop – click to loop all' : playlistLoopMode === 'all' ? 'Loop all – click to loop track' : 'Loop track – click to disable'}
                >
                  {playlistLoopMode === 'track' ? <Repeat1 size={14} /> : playlistLoopMode === 'all' ? <Repeat size={14} className="animate-spin-slow" /> : <Repeat size={14} className="opacity-30" />}
                  <span className="text-[8px] font-bold uppercase tracking-tighter">
                    {playlistLoopMode === 'off' ? 'Once' : playlistLoopMode === 'all' ? 'All' : 'Track'}
                  </span>
                </button>
              )}
              <button 
                onClick={() => toggleAll(true)}
                className="flex items-center gap-2 px-3 py-1 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all"
              >
                {musicTracks.some(t => t.isPlaying) ? <Pause size={12} /> : <Play size={12} />}
                {musicTracks.some(t => t.isPlaying) ? 'Pause' : isPlaylistMode ? 'Play' : 'Play All'}
              </button>
              <button 
                onClick={() => openResetModal('music')}
                className="flex items-center gap-2 px-3 py-1 bg-blood/10 hover:bg-blood/20 text-blood border border-blood/30 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {musicTracks.map((track) => (
              <TrackCard 
                key={track.id}
                track={track}
                masterVolume={masterMusicVolume}
                onToggle={() => togglePlay(track.id, true)}
                onVolumeChange={(v) => updateVolume(track.id, v, true)}
                onOpenLibrary={() => openLibraryForSlot(track.id, true)}
                onEdit={() => { setEditingId(track.id); setEditValue(track.name); }}
                onToggleLoop={() => toggleMusicLoop(track.id)}
                onTrackEnded={() => handleMusicTrackEnded(track.id)}
                isPlaylistMode={isPlaylistMode}
                audioRefs={audioRefs}
                audioRef={(el: any) => { if (el) audioRefs.current[track.id] = el; }}
              />
            ))}
          </div>
        </section>

        {/* SFX Section */}
        <section className="xl:col-span-6 space-y-6">
          <div className="glass-panel px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl text-gold flex items-center gap-3 font-display">
                <Zap size={20} className="text-gold/60" /> Sound Effects
              </h2>
              <button 
                onClick={addSfxSlot}
                className="p-1.5 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg transition-all"
                title="Add SFX Slot"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => toggleAll(false)}
                className="flex items-center gap-2 px-3 py-1 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all"
              >
                {sfxSlots.some(t => t.isPlaying) ? <Pause size={12} /> : <Play size={12} />}
                {sfxSlots.some(t => t.isPlaying) ? 'Pause All' : 'Play All'}
              </button>
              <button 
                onClick={() => openResetModal('sfx')}
                className="flex items-center gap-2 px-3 py-1 bg-blood/10 hover:bg-blood/20 text-blood border border-blood/30 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {sfxSlots.map((slot) => (
              <SFXButton 
                key={slot.id}
                slot={slot}
                masterVolume={masterSfxVolume}
                onToggle={() => togglePlay(slot.id, false)}
                onVolumeChange={(v) => updateVolume(slot.id, v, false)}
                onOpenLibrary={() => openLibraryForSlot(slot.id, false)}
                onEdit={() => { setEditingId(slot.id); setEditValue(slot.name); }}
                onPlayModeChange={(mode: any) => updatePlayMode(slot.id, mode)}
                audioRefs={audioRefs}
                audioRef={(el: any) => { if (el) audioRefs.current[slot.id] = el; }}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Footer / Configuration */}
      <footer className="glass-panel rounded-none border-x-0 border-b-0 py-6 px-8 mt-auto">
        <div className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <input 
              type="text" 
              placeholder="New Set Name..."
              value={currentSetName}
              onChange={(e) => setCurrentSetName(e.target.value)}
              className="bg-white/5 dark:bg-black/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-silver focus:outline-none focus:border-gold/50 transition-all w-full lg:w-64"
            />
            <button 
              onClick={saveConfiguration}
              className="flex items-center gap-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 px-6 py-2 rounded-lg transition-all font-bold text-sm"
            >
              <Save size={16} /> Save Set
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-end">
            <span className="text-[10px] uppercase tracking-[0.2em] text-theme-muted font-bold mr-2">Saved Configurations:</span>
            {savedSets.map(set => (
              <div key={set} className="group flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                <button 
                  onClick={() => loadConfiguration(set)}
                  className="px-4 py-1.5 text-xs text-theme-muted hover:text-gold hover:bg-white/5 transition-all"
                >
                  {set}
                </button>
                <button 
                  onClick={() => deleteSet(set)}
                  className="px-2 py-1.5 text-theme-muted/20 hover:text-blood hover:bg-blood/10 transition-all border-l border-white/10"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center Footer Text */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-theme-muted font-bold">
            Harmonicon by Ultima Nobis 2026 Open Source License
          </p>
        </div>
      </footer>

      {/* Library Modal */}
      <LibraryModal 
        isOpen={isLibraryOpen} 
        onClose={() => setIsLibraryOpen(false)} 
        onSelect={assignFileToSlot}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/80 dark:bg-obsidian/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-8 w-full max-w-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-8 flex-shrink-0">
                <h3 className="text-xl text-gold font-display">Application Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-theme-muted hover:text-gold">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-theme-muted mb-2">Storage Directory</label>
                  <p className="text-[10px] text-theme-muted mb-3">Specify where uploaded files should be saved on your machine.</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newPathInput}
                      onChange={(e) => setNewPathInput(e.target.value)}
                      className="flex-1 bg-white/5 dark:bg-black/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-silver focus:outline-none focus:border-gold transition-all"
                    />
                    <button 
                      onClick={async () => {
                        console.log('Select button clicked');
                        if (!(window as any).electron) {
                          alert("Native features are not available in this environment. Are you running the standalone app?");
                          return;
                        }
                        try {
                          const path = await apiService.selectDirectory();
                          console.log('Selected path:', path);
                          if (path) setNewPathInput(path);
                        } catch (e) {
                          console.error('Select directory failed', e);
                          alert("Failed to open folder selector.");
                        }
                      }}
                      className="bg-white/10 text-gold border border-gold/30 px-4 py-2 rounded-lg font-bold hover:bg-gold/10 transition-all text-sm flex items-center gap-2"
                    >
                      <FolderOpen size={16} />
                      Select
                    </button>
                    <button 
                      onClick={updateStoragePath}
                      className="bg-gold text-obsidian px-6 py-2 rounded-lg font-bold hover:bg-gold/80 transition-all text-sm"
                    >
                      Update
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-gold/60 italic">Current: {storagePath}</p>
                </div>

                <div className="pt-6 border-t border-white/10">
                  <label className="block text-xs font-bold uppercase tracking-widest text-theme-muted mb-4">Background Image</label>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {DEFAULT_BGS[theme].map((bg) => (
                      <button
                        key={bg.url}
                        onClick={() => setBgImage(bg.url)}
                        className={`aspect-video rounded-lg border-2 transition-all overflow-hidden relative group ${
                          bgImage === bg.url ? 'border-gold shadow-lg scale-105' : 'border-white/10 hover:border-gold/50'
                        }`}
                      >
                        {bg.url === 'none' ? (
                          <div className={`w-full h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'bg-black text-white/40' : 'bg-white text-black/40'}`}>
                            {bg.name}
                          </div>
                        ) : (
                          <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[8px] text-white font-bold uppercase tracking-widest">{bg.name}</span>
                        </div>
                      </button>
                    ))}
                    {customBgs.map((url, i) => (
                      <button
                        key={url}
                        onClick={() => setBgImage(url)}
                        className={`aspect-video rounded-lg border-2 transition-all overflow-hidden relative group ${
                          bgImage === url ? 'border-gold shadow-lg scale-105' : 'border-white/10 hover:border-gold/50'
                        }`}
                      >
                        <img src={url} alt={`Custom ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[8px] text-white font-bold uppercase tracking-widest">Custom {i+1}</span>
                        </div>
                      </button>
                    ))}
                    <label className="aspect-video rounded-lg border-2 border-dashed border-white/20 hover:border-gold/50 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group">
                      <Upload size={16} className="text-theme-muted group-hover:text-gold" />
                      <span className="text-[8px] text-theme-muted font-bold uppercase tracking-widest group-hover:text-gold">Upload</span>
                      <input type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10">
                  <label className="block text-xs font-bold uppercase tracking-widest text-theme-muted mb-4">Environment & Database</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                      <span className="text-[10px] text-theme-muted font-bold uppercase tracking-widest">Environment</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${window.electron ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {window.electron ? 'Native Electron' : 'Web Preview'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                      <span className="text-[10px] text-theme-muted font-bold uppercase tracking-widest">Database Status</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${dbStatus === 'ok' ? 'text-emerald-400' : dbStatus === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                        {dbStatus.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10">
                  <label className="block text-xs font-bold uppercase tracking-widest text-theme-muted mb-1">Backup & Restore</label>
                  <p className="text-[10px] text-theme-muted/60 leading-relaxed mb-4">
                    Export your entire setup — library, presets, themes, and all uploaded audio files — into a single <span className="text-gold/70 font-mono">.harmonicon</span> file.
                    Import it on any machine running Harmonicon to restore everything exactly as it was.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={handleExport}
                      disabled={backupStatus.type === 'working'}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download size={14} />
                      Export Backup
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={backupStatus.type === 'working'}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-silver rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <PackageOpen size={14} />
                      Import Backup
                    </button>
                  </div>

                  {/* Status feedback */}
                  {backupStatus.type !== 'idle' && (
                    <div className={`mt-3 px-4 py-2.5 rounded-lg text-[10px] font-bold flex items-center gap-2 ${
                      backupStatus.type === 'working' ? 'bg-gold/5 border border-gold/20 text-gold' :
                      backupStatus.type === 'ok'      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' :
                                                        'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                      {backupStatus.type === 'working' && <RotateCcw size={12} className="animate-spin flex-shrink-0" />}
                      {backupStatus.type === 'ok'      && <Check size={12} className="flex-shrink-0" />}
                      {backupStatus.type === 'error'   && <X size={12} className="flex-shrink-0" />}
                      <span className="break-all">{backupStatus.msg}</span>
                      {backupStatus.type !== 'working' && (
                        <button onClick={() => setBackupStatus({ type: 'idle', msg: '' })} className="ml-auto text-current/40 hover:text-current flex-shrink-0">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-white/10">
                  <label className="block text-xs font-bold uppercase tracking-widest text-theme-muted mb-4">Maintenance</label>
                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] text-theme-muted/60 leading-relaxed">
                      If your library is not updating or you see database errors, try resetting the internal database. 
                      This will clear your library index and saved sets, but will NOT delete your physical audio files.
                    </p>
                    <button 
                      onClick={() => {
                        if (confirm('Are you sure? This will clear your library index and saved sets. Your audio files will remain safe on disk.')) {
                          db.reset();
                        }
                      }}
                      className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} /> Reset Internal Database
                    </button>
                    <button 
                      onClick={() => {
                        if (confirm('DANGER: This will clear ALL settings, backgrounds, and library data. Physical files will NOT be deleted.')) {
                          localStorage.clear();
                          db.reset();
                        }
                      }}
                      className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-600 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Zap size={14} /> Factory Reset (Clear All Data)
                    </button>
                  </div>
                </div>

                <div className="pt-8 border-t border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-theme-muted mb-6">About</h4>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-gold/10 border border-gold/30 rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
                      <img 
                        src="/logo.png" 
                        alt="Logo" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://picsum.photos/seed/harmonicon/100/100";
                        }}
                      />
                    </div>
                    <div>
                      <h4 className="text-lg font-display text-gold">Harmonicon</h4>
                      <p className="text-[8px] tracking-[0.3em] text-theme-muted uppercase font-bold">TTRPG Sound Panel</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-sm text-theme-muted leading-relaxed">
                      Harmonicon is a professional-grade TTRPG soundboard crafted for GMs who demand total immersion. 
                      Designed with a focus on tactile control and visual elegance, it allows you to orchestrate 
                      complex soundscapes with ease.
                    </p>
                    <p className="text-sm text-theme-muted leading-relaxed">
                      This project is <span className="text-gold font-bold">Open Source</span> and built by the community 
                      for the community. We believe in providing powerful, accessible tools for storytellers everywhere. 
                      All your files remain local, ensuring your campaign data stays private and performant.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="px-2 py-0.5 bg-gold/10 border border-gold/20 text-gold text-[8px] font-bold uppercase tracking-widest rounded">v2.0.1</span>
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-theme-muted text-[8px] font-bold uppercase tracking-widest rounded">MIT License</span>
                      <a 
                        href="https://github.com/madmobmurphy/harmonicon" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 text-theme-muted text-[8px] font-bold uppercase tracking-widest rounded hover:bg-white/10 hover:text-gold transition-all"
                      >
                        <Github size={10} />
                        GitHub
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex justify-end flex-shrink-0">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-8 py-2 border border-white/10 text-theme-muted rounded-lg font-bold hover:bg-white/5 transition-all text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 bg-black/80 dark:bg-obsidian/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-8 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl text-gold font-display">Reset {resetTarget === 'all' ? 'All' : resetTarget === 'music' ? 'Music' : 'SFX'}</h3>
                <button onClick={() => setIsResetModalOpen(false)} className="text-theme-muted hover:text-gold">
                  <X size={24} />
                </button>
              </div>
              
              <p className="text-sm text-theme-muted mb-8 leading-relaxed">
                Choose how you want to reset the {resetTarget === 'all' ? 'entire panel' : resetTarget === 'music' ? 'music tracks' : 'SFX slots'}.
              </p>

              <div className="space-y-4">
                <button 
                  onClick={() => handleReset('files')}
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-silver py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-3"
                >
                  <RotateCcw size={18} className="text-gold" />
                  Clear Loaded Files
                </button>
                <button 
                  onClick={() => handleReset('count')}
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-silver py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-3"
                >
                  <RotateCcw size={18} className="text-gold" />
                  Reset Player Count to Default
                </button>
                <button 
                  onClick={() => handleReset('both')}
                  className="w-full bg-gold text-obsidian py-3 rounded-lg font-bold hover:bg-gold/80 transition-all flex items-center justify-center gap-3"
                >
                  <RotateCcw size={18} />
                  Reset Both (Count & Files)
                </button>
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-6 py-2 border border-white/10 text-theme-muted rounded-lg font-bold hover:bg-white/5 transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {editingId && (
          <div className="fixed inset-0 bg-black/80 dark:bg-obsidian/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-8 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl text-gold font-display">Rename Slot</h3>
                <button onClick={() => setEditingId(null)} className="text-theme-muted hover:text-gold">
                  <X size={24} />
                </button>
              </div>
              <input 
                type="text" 
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                className="w-full bg-white/5 dark:bg-black/5 border border-white/10 rounded-lg px-4 py-3 text-lg text-silver focus:outline-none focus:border-gold transition-all mb-8"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setMusicTracks(prev => prev.map(t => t.id === editingId ? { ...t, name: editValue } : t));
                    setSfxSlots(prev => prev.map(s => s.id === editingId ? { ...s, name: editValue } : s));
                    setEditingId(null);
                  }}
                  className="flex-1 bg-gold text-obsidian py-3 rounded-lg font-bold hover:bg-gold/80 transition-all"
                >
                  Save
                </button>
                <button 
                  onClick={() => setEditingId(null)}
                  className="px-6 border border-white/10 text-theme-muted rounded-lg font-bold hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Shared MarqueeText component: scrolls text on hover when it overflows
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && spanRef.current) {
        setOffset(Math.max(0, spanRef.current.scrollWidth - containerRef.current.clientWidth));
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${className ?? ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={spanRef}
        className="inline-block whitespace-nowrap"
        style={{
          transform: hovered && offset > 0 ? `translateX(-${offset}px)` : 'translateX(0)',
          transition: hovered && offset > 0
            ? `transform ${Math.max(1.5, offset / 60)}s ease-in-out 0.3s`
            : 'transform 0.5s ease-in-out 0s',
        }}
      >
        {text}
      </span>
    </div>
  );
}

function TrackCard({ track, masterVolume, onToggle, onVolumeChange, onOpenLibrary, onEdit, onToggleLoop, onTrackEnded, isPlaylistMode, audioRefs, audioRef }: any) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRefs.current[track.id];
    if (audio) audio.volume = track.volume * masterVolume;
  }, [track.volume, masterVolume, track.id, audioRefs]);

  // Attach timeupdate via rAF for smooth scrubbing without overloading state
  useEffect(() => {
    const audio = audioRefs.current[track.id];
    if (!audio) return;

    const onDurationChange = () => setDuration(audio.duration || 0);
    const tick = () => {
      if (!isSeeking) setCurrentTime(audio.currentTime || 0);
      rafRef.current = requestAnimationFrame(tick);
    };

    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    if (audio.duration) setDuration(audio.duration);

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [track.id, track.url, audioRefs, isSeeking]);

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSeekStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true);
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekMove = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const audio = audioRefs.current[track.id];
    if (audio && isFinite(audio.duration)) {
      audio.currentTime = val;
      setCurrentTime(val);
    }
    setIsSeeking(false);
  };

  const handleRestart = () => {
    const audio = audioRefs.current[track.id];
    if (audio) { audio.currentTime = 0; setCurrentTime(0); }
  };

  const audioLoop = !isPlaylistMode && track.isLooping;
  const progressVal = isSeeking ? seekValue : currentTime;
  const progressPct = duration > 0 ? (progressVal / duration) * 100 : 0;

  return (
    <motion.div 
      layout
      className={`glass-panel p-4 glass-panel-hover relative overflow-hidden group ${track.isPlaying ? 'active-glow' : ''}`}
    >
      {/* Playlist indicator strip */}
      {isPlaylistMode && track.isPlaying && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold rounded-l-xl" />
      )}

      <div className="flex items-center gap-4 relative z-10">
        <button 
          onClick={onToggle}
          disabled={!track.url}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
            !track.url 
              ? 'bg-white/5 text-white/10 cursor-not-allowed' 
              : track.isPlaying 
                ? 'bg-gold text-obsidian shadow-[0_0_20px_rgba(212,175,55,0.4)]' 
                : 'bg-white/10 text-gold hover:bg-white/20'
          }`}
        >
          {track.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Name + edit */}
          <div className="flex items-center gap-2 mb-1.5">
            <MarqueeText text={track.name} className="text-sm font-bold text-theme-muted flex-1 min-w-0" />
            <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 transition-opacity text-theme-muted/20 hover:text-gold flex-shrink-0">
              <Edit2 size={12} />
            </button>
          </div>

          {/* Progress bar + time */}
          {track.url ? (
            <div className="mb-1.5">
              <div className="relative flex items-center gap-2">
                {/* Back-to-start button — only visible when not at 0 */}
                <button
                  onClick={handleRestart}
                  title="Restart"
                  className={`flex-shrink-0 transition-all ${currentTime > 0.5 ? 'text-gold/60 hover:text-gold' : 'text-white/10 pointer-events-none'}`}
                >
                  <SkipBack size={11} />
                </button>

                {/* Seekable progress track */}
                <div className="relative flex-1 h-1.5 group/seek">
                  {/* Filled portion */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gold/60 rounded-full pointer-events-none transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                  {/* Invisible range input on top */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={progressVal}
                    disabled={!duration}
                    onChange={handleSeekMove}
                    onMouseDown={handleSeekStart}
                    onTouchStart={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    onTouchEnd={handleSeekEnd}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                    style={{ margin: 0 }}
                  />
                  {/* Hover thumb dot */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-gold rounded-full shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
                    style={{ left: `calc(${progressPct}% - 5px)` }}
                  />
                </div>

                {/* Time display */}
                <span className="flex-shrink-0 text-[9px] font-mono text-theme-muted/50 tabular-nums">
                  {formatTime(progressVal)}<span className="text-theme-muted/25"> / {formatTime(duration)}</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="mb-1.5 h-4" /> 
          )}

          {/* Volume */}
          <div className="flex items-center gap-3">
            <Volume2 size={12} className="text-theme-muted/30 flex-shrink-0" />
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={track.volume} 
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="flex-1"
            />
          </div>
        </div>

        {/* Loop toggle — only shown in standard mode */}
        {!isPlaylistMode ? (
          <button
            onClick={onToggleLoop}
            className={`flex flex-col items-center gap-1 px-2 border-l border-white/5 transition-all flex-shrink-0 ${track.isLooping ? 'text-gold' : 'text-white/20 hover:text-white/40'}`}
            title={track.isLooping ? 'Loop ON – click to disable' : 'Loop OFF – click to enable'}
          >
            <RotateCcw size={14} className={track.isLooping ? 'animate-spin-slow' : ''} />
            <span className="text-[8px] font-bold uppercase tracking-tighter">{track.isLooping ? 'Loop' : 'Once'}</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 border-l border-white/5 text-gold/40 flex-shrink-0">
            <ListMusic size={14} />
            <span className="text-[8px] font-bold uppercase tracking-tighter">List</span>
          </div>
        )}

        <button 
          onClick={onOpenLibrary}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-theme-muted/40 hover:text-gold transition-all flex-shrink-0"
          title="Open Library"
        >
          <FolderOpen size={18} />
        </button>
      </div>

      {track.url && (
        <audio 
          ref={(el) => {
            audioRef(el);
            if (el) {
              el.volume = track.volume * masterVolume;
              el.loop = audioLoop;
            }
          }}
          src={track.url}
          onLoadStart={() => console.log(`[Music] Loading: ${track.url}`)}
          onCanPlay={() => console.log(`[Music] Can play: ${track.url}`)}
          onError={(e) => console.error(`[Music] Error: ${track.url}`, e)}
          onEnded={() => {
            if (isPlaylistMode) {
              onTrackEnded();
            } else if (!audioLoop && track.isPlaying) {
              onToggle();
            }
          }}
        />
      )}
    </motion.div>
  );
}

function SFXButton({ slot, masterVolume, onToggle, onVolumeChange, onOpenLibrary, onEdit, onPlayModeChange, audioRefs, audioRef }: any) {
  const playCountRef = useRef(0);

  useEffect(() => {
    if (!slot.isPlaying) {
      playCountRef.current = 0;
    }
  }, [slot.isPlaying]);

  const handleEnded = () => {
    if (slot.playMode === 'twice') {
      playCountRef.current += 1;
      if (playCountRef.current < 2) {
        const audio = audioRefs.current[slot.id];
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(e => console.error("Playback failed", e));
          return;
        }
      }
    }
    playCountRef.current = 0;
    onToggle();
  };

  const nextPlayMode = () => {
    const modes: ('once' | 'twice' | 'loop')[] = ['once', 'twice', 'loop'];
    const currentIndex = modes.indexOf(slot.playMode || 'once');
    const nextIndex = (currentIndex + 1) % modes.length;
    onPlayModeChange(modes[nextIndex]);
  };

  useEffect(() => {
    const audio = audioRefs.current[slot.id];
    if (audio) {
      audio.volume = slot.volume * masterVolume;
    }
  }, [slot.volume, masterVolume, slot.id, audioRefs]);

  return (
    <motion.div 
      layout
      className={`glass-panel p-3 glass-panel-hover flex flex-col items-center gap-3 group relative ${slot.isPlaying ? 'active-glow bg-gold/5' : ''}`}
    >
      <div className="w-full flex justify-between items-center">
        <button 
          onClick={nextPlayMode}
          className="text-[9px] font-bold text-theme-muted hover:text-gold transition-all bg-white/5 px-1.5 py-0.5 rounded border border-white/5"
          title="Toggle Play Mode"
        >
          {slot.playMode === 'once' ? '1x' : slot.playMode === 'twice' ? '2x' : '∞'}
        </button>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-theme-muted/30 hover:text-gold transition-all">
            <Edit2 size={10} />
          </button>
          <button onClick={onOpenLibrary} className="text-theme-muted/30 hover:text-gold transition-all">
            <FolderOpen size={10} />
          </button>
        </div>
      </div>

      <button 
        onClick={onToggle}
        disabled={!slot.url}
        className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
          !slot.url 
            ? 'bg-white/5 text-white/10 cursor-not-allowed' 
            : slot.isPlaying 
              ? 'bg-gold text-obsidian' 
              : 'bg-white/5 text-gold hover:bg-white/10'
        }`}
      >
        <Zap size={slot.isPlaying ? 24 : 20} className={slot.isPlaying ? 'animate-pulse' : ''} />
        <div className="w-full px-1 overflow-hidden">
          <MarqueeText text={slot.name} className="text-[9px] font-bold uppercase tracking-widest text-center" />
        </div>
      </button>

      <input 
        type="range" 
        min="0" max="1" step="0.01" 
        value={slot.volume} 
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="w-full"
      />

      {slot.url && (
        <audio 
          ref={(el) => {
            audioRef(el);
            if (el) {
              el.volume = slot.volume * masterVolume;
              el.loop = slot.playMode === 'loop';
            }
          }}
          src={slot.url}
          onLoadStart={() => console.log(`[SFX] Loading: ${slot.url}`)}
          onCanPlay={() => console.log(`[SFX] Can play: ${slot.url}`)}
          onError={(e) => console.error(`[SFX] Error: ${slot.url}`, e)}
          onEnded={handleEnded}
        />
      )}
    </motion.div>
  );
}

function LibraryModal({ isOpen, onClose, onSelect }: { isOpen: boolean, onClose: () => void, onSelect: (file: LibraryFile) => void }) {
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewFileId, setPreviewFileId] = useState<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop preview when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      setPreviewFileId(null);
    }
  }, [isOpen]);

  const togglePreview = (file: LibraryFile) => {
    if (previewFileId === file.id) {
      // Stop preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      setPreviewFileId(null);
    } else {
      // Start preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = previewAudioRef.current || new Audio();
      audio.src = file.serverPath;
      audio.volume = 0.6;
      audio.play().catch(() => {});
      previewAudioRef.current = audio;
      setPreviewFileId(file.id!);
      // Auto-stop when preview ends
      audio.onended = () => setPreviewFileId(null);
    }
  };

  const folders = useLiveQuery(() => db.folders.toArray()) || [];
  const files = useLiveQuery(() => 
    searchQuery 
      ? db.files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).toArray()
      : db.files.where('folderId').equals(currentFolderId ?? -1).toArray()
  , [currentFolderId, searchQuery]) || [];

  const currentFolder = useMemo(() => folders.find(f => f.id === currentFolderId), [folders, currentFolderId]);
  
  // Get relative path for current folder
  const getCurrentFolderPath = useCallback(() => {
    const pathParts = [];
    let tempId = currentFolderId;
    while (tempId !== null) {
      const folder = folders.find(f => f.id === tempId);
      if (folder) {
        pathParts.unshift(folder.name);
        tempId = folder.parentId;
      } else {
        tempId = null;
      }
    }
    return pathParts.join('/');
  }, [currentFolderId, folders]);

  const syncLibrary = useCallback(async () => {
    try {
      // Ensure DB is open
      if (!db.isOpen()) {
        await db.open();
      }

      const result = await apiService.scanLibrary();
      if (result.success && result.items) {
        console.log(`[Sync] Starting sync with ${result.items.length} items`);
        
        // 1. Sync Folders
        const dbFolders = await db.folders.toArray();
        const fsFolders = result.items.filter((i: any) => i.type === 'folder');
        
        // Map to store folder name -> id for parent resolution
        const folderMap = new Map<string, number>();
        
        // Process folders level by level or just by path
        for (const fsFolder of fsFolders) {
          const parts = fsFolder.path.split(/[/\\]/);
          let parentId: number | null = null;
          let currentPath = '';
          
          for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            let existing = dbFolders.find(f => f.name === part && f.parentId === parentId);
            if (!existing) {
              const newId = await db.folders.add({ name: part, parentId });
              parentId = newId as number;
              dbFolders.push({ id: parentId, name: part, parentId });
            } else {
              parentId = existing.id!;
            }
            folderMap.set(currentPath, parentId);
          }
        }

        // 2. Sync Files
        const dbFiles = await db.files.toArray();
        const fsFiles = result.items.filter((i: any) => i.type === 'file');

        for (const fsFile of fsFiles) {
          const parts = fsFile.path.split(/[/\\]/);
          const fileName = parts.pop();
          const folderPath = parts.join('/');
          const folderId = folderPath ? (folderMap.get(folderPath) ?? -1) : -1;
          
          const serverPath = `media:/${fsFile.path.replace(/\\/g, '/')}`;
          const existing = dbFiles.find(f => f.serverPath === serverPath);
          if (!existing) {
            console.log(`[Sync] Adding new file: ${serverPath}`);
            await db.files.add({
              name: fileName!.replace(/\.[^/.]+$/, ""),
              folderId,
              serverPath,
              type: 'audio/mpeg', 
              size: fsFile.size,
              createdAt: fsFile.createdAt
            });
          }
        }

        // 3. Cleanup missing items from DB
        const fsFilePaths = new Set(fsFiles.map((f: any) => `media:/${f.path.replace(/\\/g, '/')}`));
        for (const dbFile of dbFiles) {
          if (!fsFilePaths.has(dbFile.serverPath)) {
            await db.files.delete(dbFile.id!);
          }
        }
        console.log('[Sync] Sync completed');
      }
    } catch (err: any) {
      console.error('[Sync] Fatal error during sync:', err);
      if (err.name === 'DatabaseClosedError' || err.name === 'UnknownError') {
        console.warn('[Sync] Database error detected, attempting to re-open...');
        try {
          await db.open();
        } catch (reopenErr) {
          console.error('[Sync] Failed to re-open database:', reopenErr);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) syncLibrary();
  }, [isOpen, syncLibrary]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!db.isOpen()) await db.open();
      const relativeFolder = getCurrentFolderPath();
      const data = await apiService.uploadFile(file, relativeFolder);
      
      if (data.success) {
        const serverPath = data.path.replace('media:///', 'media:/');
        await db.files.add({
          name: file.name.replace(/\.[^/.]+$/, ""),
          folderId: currentFolderId ?? -1,
          serverPath,
          type: file.type,
          size: file.size,
          createdAt: Date.now()
        });
        await syncLibrary(); 
      }
    } catch (e: any) {
      console.error("Upload failed", e);
      if (e.name === 'DatabaseClosedError' || e.name === 'UnknownError') {
        alert("Database error. Please try resetting the database in Settings.");
      }
    }
  };

  const createFolder = async () => {
    console.log('createFolder called with name:', newFolderName, 'parent:', currentFolderId);
    if (!newFolderName) return;
    try {
      // In physical mode, we don't strictly need to add to DB first, 
      // but it helps UI responsiveness. The real folder is created on upload or sync.
      const id = await db.folders.add({
        name: newFolderName,
        parentId: currentFolderId
      });
      console.log('Folder created with id:', id);
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (e) {
      console.error("Failed to create folder", e);
      alert("Failed to create folder. Please check the console for more details.");
    }
  };

  const deleteFile = async (file: LibraryFile) => {
    if (confirm('Delete this file permanently from disk?')) {
      const relPath = file.serverPath.replace(/^media:\/+/, '');
      const res = await apiService.deletePhysicalItem(relPath, false);
      if (res.success) {
        await db.files.delete(file.id!);
      } else {
        alert("Failed to delete file from disk: " + res.error);
      }
    }
  };

  const deleteFolder = async (folder: Folder) => {
    if (confirm('Delete this folder and all its contents permanently from disk?')) {
      // Calculate relative path
      const pathParts = [];
      let tempId = folder.id;
      while (tempId !== null) {
        const f = folders.find(item => item.id === tempId);
        if (f) {
          pathParts.unshift(f.name);
          tempId = f.parentId;
        } else {
          tempId = null;
        }
      }
      const relPath = pathParts.join('/');
      
      const res = await apiService.deletePhysicalItem(relPath, true);
      if (res.success) {
        await db.files.where('folderId').equals(folder.id!).delete();
        await db.folders.delete(folder.id!);
        if (currentFolderId === folder.id) setCurrentFolderId(null);
        await syncLibrary();
      } else {
        alert("Failed to delete folder from disk: " + res.error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 dark:bg-obsidian/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4 lg:p-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full max-w-6xl h-full flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gold/10 rounded-lg flex items-center justify-center">
              <FolderOpen className="text-gold" size={20} />
            </div>
            <div>
              <h2 className="text-xl text-gold font-display">Sound Library</h2>
              <p className="text-[10px] text-theme-muted uppercase tracking-widest font-bold">Manage your audio assets</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-theme-muted hover:text-gold transition-all">
            <X size={24} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentFolderId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentFolderId === null ? 'bg-gold text-obsidian' : 'text-theme-muted hover:text-silver'}`}
            >
              Root
            </button>
            {currentFolderId !== null && (
              <>
                <ChevronRight size={14} className="text-theme-muted/20" />
                <span className="text-xs text-gold font-bold">{currentFolder?.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={syncLibrary}
              className="flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-silver transition-all"
              title="Rescan physical folder"
            >
              <RotateCcw size={14} /> Refresh
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted/30" size={14} />
              <input 
                type="text" 
                placeholder="Search library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 dark:bg-black/5 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-silver focus:outline-none focus:border-gold/50 w-48 lg:w-64"
              />
            </div>
            <button 
              onClick={() => setIsCreatingFolder(true)}
              className="flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-silver transition-all"
            >
              <FolderPlus size={14} /> New Folder
            </button>
            <label className="flex items-center gap-2 px-4 py-1.5 bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-lg text-xs text-gold cursor-pointer transition-all">
              <Upload size={14} /> Upload Audio
              <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        {/* Browser */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {isCreatingFolder && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-gold/5 border border-gold/20 rounded-xl flex items-center gap-4"
              >
                <FolderPlus className="text-gold" size={20} />
                <input 
                  type="text" 
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                  className="flex-1 bg-transparent border-none text-silver focus:outline-none placeholder:text-theme-muted/30"
                />
                <button onClick={createFolder} className="text-gold hover:text-gold/80 font-bold text-xs uppercase tracking-widest">Create</button>
                <button onClick={() => setIsCreatingFolder(false)} className="text-silver/40 hover:text-silver text-xs uppercase tracking-widest">Cancel</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Folders */}
            {folders.filter(f => f.parentId === currentFolderId).map(folder => (
              <div 
                key={folder.id}
                className="glass-panel p-4 glass-panel-hover flex flex-col items-center gap-3 group cursor-pointer"
                onClick={() => setCurrentFolderId(folder.id!)}
              >
                <div className="relative">
                  <FolderOpen className="text-gold/60 group-hover:text-gold transition-all" size={48} />
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }}
                    className="absolute -top-2 -right-2 p-1.5 bg-obsidian border border-white/10 rounded-full text-theme-muted hover:text-blood opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <span className="text-xs font-bold text-theme-muted group-hover:text-silver w-full text-center"><MarqueeText text={folder.name} /></span>
              </div>
            ))}

            {/* Files */}
            {files.map(file => (
              <div 
                key={file.id}
                className={`glass-panel p-4 glass-panel-hover flex flex-col items-center gap-3 group ${previewFileId === file.id ? 'active-glow' : ''}`}
              >
                <div className="relative w-full flex justify-center">
                  <FileAudio className={`transition-all ${previewFileId === file.id ? 'text-gold/60 animate-pulse' : 'text-silver/20 group-hover:text-gold/40'}`} size={48} />
                  
                  {/* Hover action overlay: preview + add */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    {/* Pre-listen button */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); togglePreview(file); }}
                      className={`p-2 rounded-full shadow-xl transform scale-90 group-hover:scale-100 transition-all border ${
                        previewFileId === file.id 
                          ? 'bg-gold/30 border-gold text-gold' 
                          : 'bg-black/60 border-white/20 text-white hover:text-gold'
                      }`}
                      title={previewFileId === file.id ? 'Stop preview' : 'Preview audio'}
                    >
                      {previewFileId === file.id ? <StopCircle size={16} /> : <Headphones size={16} />}
                    </button>
                    {/* Add to slot button */}
                    <button 
                      onClick={() => { onSelect(file); if (previewAudioRef.current) { previewAudioRef.current.pause(); } setPreviewFileId(null); }}
                      className="bg-gold text-obsidian p-2 rounded-full shadow-xl transform scale-90 group-hover:scale-100 transition-all"
                      title="Add to slot"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  <button 
                    onClick={() => deleteFile(file)}
                    className="absolute -top-2 -right-2 p-1.5 bg-obsidian border border-white/10 rounded-full text-theme-muted hover:text-blood opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Rolling filename */}
                <MarqueeText text={file.name} className="text-xs font-bold text-theme-muted group-hover:text-silver w-full text-center" />

                <div className="flex items-center gap-2 w-full justify-center">
                  <span className="text-[9px] text-theme-muted/40 uppercase font-mono">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  {previewFileId === file.id && (
                    <span className="text-[9px] text-gold font-bold uppercase tracking-widest animate-pulse">● Playing</span>
                  )}
                </div>
              </div>
            ))}

            {folders.length === 0 && files.length === 0 && !isCreatingFolder && (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-theme-muted/20 gap-4">
                <FolderOpen size={64} strokeWidth={1} />
                <p className="font-display tracking-widest">This folder is empty</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
