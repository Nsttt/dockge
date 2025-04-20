import { SocketHandler } from "../socket-handler";
import { DockgeServer } from "../dockge-server";
import { DockgeSocket } from "../util-server";
import { GitSocketHandler } from "./git-socket-handler";

export class GitSocketHandlerWrapper extends SocketHandler {
    create(socket: DockgeSocket, server: DockgeServer): void {
        if (socket.userID) {
            // Only create for authenticated users
            new GitSocketHandler(server.io, socket, socket.userID);
        }
    }
}