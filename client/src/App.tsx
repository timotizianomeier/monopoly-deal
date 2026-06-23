import React from 'react';
import { useSocket } from './socket/useSocket.js';
import HomeScreen from './screens/HomeScreen.js';
import LobbyScreen from './screens/LobbyScreen.js';
import GameScreen from './screens/GameScreen.js';

export default function App(): React.JSX.Element {
  const socket = useSocket();

  if (socket.phase === 'home') return <HomeScreen socket={socket} />;
  if (socket.phase === 'lobby') return <LobbyScreen socket={socket} />;
  // 'game' and 'over' both render GameScreen; RoundOverModal is shown inside when gameOver is set
  return <GameScreen socket={socket} />;
}
