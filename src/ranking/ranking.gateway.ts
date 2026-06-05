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
  namespace: '/ranking',
})
export class RankingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  afterInit() {
    console.log('📊 Ranking WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`📊 Client connected to ranking: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`📊 Client disconnected from ranking: ${client.id}`);
  }

  emitRankingUpdate(ranking: any[]) {
    this.server.emit('ranking-update', ranking);
  }
}
