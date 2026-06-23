import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  RoomState,
  RedactedGameView,
  ScoreEntry,
  GameAction,
} from '@monopoly-deal/shared';

export interface ChatMsg {
  playerId: string;
  playerName: string;
  text: string;
  ts: number;
}

export type AppPhase = 'home' | 'lobby' | 'game' | 'over';

export interface SocketHook {
  socket: Socket | null;
  connected: boolean;
  playerId: string | null;
  roomCode: string | null;
  roomState: RoomState | null;
  gameView: RedactedGameView | null;
  gameOver: { winnerId: string; scoreboard: ScoreEntry[] } | null;
  chatMessages: ChatMsg[];
  error: string | null;
  phase: AppPhase;
  createRoom: (name: string) => Promise<{ roomCode: string; playerId: string }>;
  joinRoom: (roomCode: string, name: string, existingPlayerId?: string) => Promise<{ playerId: string }>;
  startGame: () => void;
  sendAction: (action: GameAction) => void;
  sendChat: (text: string) => void;
  rematch: () => void;
  clearError: () => void;
  leaveRoom: () => void;
}

export function useSocket(): SocketHook {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem('md_playerId'));
  const [roomCode, setRoomCode] = useState<string | null>(() => localStorage.getItem('md_roomCode'));
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameView, setGameView] = useState<RedactedGameView | null>(null);
  const [gameOver, setGameOver] = useState<{ winnerId: string; scoreboard: ScoreEntry[] } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AppPhase>('home');

  const playerIdRef = useRef(playerId);
  const roomCodeRef = useRef(roomCode);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  useEffect(() => {
    const sock = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    setSocket(sock);

    sock.on('connect', () => {
      setConnected(true);

      // Auto-reconnect if we have stored credentials
      const storedPlayerId = playerIdRef.current;
      const storedRoomCode = roomCodeRef.current;
      if (storedPlayerId && storedRoomCode) {
        sock.emit('room:join', { roomCode: storedRoomCode, name: '' }, (res: { playerId: string } | { error: string }) => {
          if ('error' in res) {
            // Stored session is no longer valid — clear it
            localStorage.removeItem('md_playerId');
            localStorage.removeItem('md_roomCode');
            setPlayerId(null);
            setRoomCode(null);
            setPhase('home');
          }
        });
      }
    });

    sock.on('disconnect', () => {
      setConnected(false);
    });

    sock.on('room:state', (payload: RoomState) => {
      setRoomState(payload);
      if (payload.gameStarted) {
        setPhase('game');
      } else {
        setPhase('lobby');
      }
    });

    sock.on('game:view', (payload: { view: RedactedGameView }) => {
      setGameView(payload.view);
      if (payload.view.phase === 'FINISHED') {
        // Keep showing game screen; RoundOverModal handles it
      }
      if (payload.view.phase !== 'WAITING') {
        setPhase('game');
      }
    });

    sock.on('game:over', (payload: { winnerId: string; scoreboard: ScoreEntry[] }) => {
      setGameOver(payload);
      setPhase('over');
    });

    sock.on('chat:message', (payload: ChatMsg) => {
      setChatMessages(prev => [...prev, payload]);
    });

    sock.on('error', (payload: { code: string; message: string }) => {
      setError(payload.message);
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string): Promise<{ roomCode: string; playerId: string }> => {
    return new Promise((resolve, reject) => {
      if (!socket) { reject(new Error('Not connected')); return; }
      socket.emit('room:create', { name }, (res: { roomCode: string; playerId: string } | { error: string }) => {
        if ('error' in res) {
          setError(res.error);
          reject(new Error(res.error));
        } else {
          setPlayerId(res.playerId);
          setRoomCode(res.roomCode);
          localStorage.setItem('md_playerId', res.playerId);
          localStorage.setItem('md_roomCode', res.roomCode);
          resolve(res);
        }
      });
    });
  }, [socket]);

  const joinRoom = useCallback((code: string, name: string, _existingPlayerId?: string): Promise<{ playerId: string }> => {
    return new Promise((resolve, reject) => {
      if (!socket) { reject(new Error('Not connected')); return; }
      socket.emit('room:join', { roomCode: code, name }, (res: { playerId: string } | { error: string }) => {
        if ('error' in res) {
          setError(res.error);
          reject(new Error(res.error));
        } else {
          setPlayerId(res.playerId);
          setRoomCode(code);
          localStorage.setItem('md_playerId', res.playerId);
          localStorage.setItem('md_roomCode', code);
          resolve(res);
        }
      });
    });
  }, [socket]);

  const startGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  const sendAction = useCallback((action: GameAction) => {
    socket?.emit('game:action', { action });
  }, [socket]);

  const sendChat = useCallback((text: string) => {
    socket?.emit('chat:message', { text });
  }, [socket]);

  const rematch = useCallback(() => {
    setGameOver(null);
    setGameView(null);
    socket?.emit('game:start');
  }, [socket]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    localStorage.removeItem('md_playerId');
    localStorage.removeItem('md_roomCode');
    setPlayerId(null);
    setRoomCode(null);
    setRoomState(null);
    setGameView(null);
    setGameOver(null);
    setPhase('home');
  }, [socket]);

  return {
    socket,
    connected,
    playerId,
    roomCode,
    roomState,
    gameView,
    gameOver,
    chatMessages,
    error,
    phase,
    createRoom,
    joinRoom,
    startGame,
    sendAction,
    sendChat,
    rematch,
    clearError,
    leaveRoom,
  };
}
