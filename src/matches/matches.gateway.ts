import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/matches',
})
export class MatchesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  afterInit() {
    console.log('⚽ Matches WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`⚽ Client connected to matches: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`⚽ Client disconnected from matches: ${client.id}`);
  }

  emitMatchUpdate(match: any) {
    if (!this.server) return;
    this.server.emit('match-update', match);
  }

  emitMatchesBatchUpdate(matches: any[]) {
    if (!this.server) return;
    this.server.emit('matches-batch-update', matches);
  }

  emitLiveStatus(liveCount: number, liveMatches: any[]) {
    if (!this.server) return;
    this.server.emit('live-status', { liveCount, liveMatches });
  }
}
