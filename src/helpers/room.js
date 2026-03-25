/**
 * @file src/helpers/room.js
 * @description Utility functions related to Socket.IO room management.
 *
 * Exports:
 *   getRoomSize(io, roomId) — returns the member count for a room.
 *   emitRoomCount(io, roomId) — broadcasts the member count to a room.
 */

/**
 * getRoomSize — returns the number of connected sockets in a room.
 *
 * @param   {import("socket.io").Server} io     — the Socket.IO server instance.
 * @param   {string}                     roomId — the room identifier.
 * @returns {number} Count of sockets currently in the room, or 0 if the
 *                   room does not exist / is empty.
 */
function getRoomSize(io, roomId) {
  return io.sockets.adapter.rooms.get(roomId)?.size || 0;
}

/**
 * emitRoomCount — broadcasts the current member count to every socket
 *                 in the specified room.
 *
 * @param   {import("socket.io").Server} io     — the Socket.IO server instance.
 * @param   {string}                     roomId — the room to broadcast to.
 * @returns {void}
 *
 * Emitted event:
 *   "room:count" with payload { roomId: string, count: number }
 */
function emitRoomCount(io, roomId) {
  io.to(roomId).emit("room:count", {
    roomId,
    count: getRoomSize(io, roomId)
  });
}

module.exports = { getRoomSize, emitRoomCount };
