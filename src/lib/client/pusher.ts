"use client";

import Pusher from "pusher-js";

let instance: Pusher | null = null;

export function getPusher(): Pusher {
  if (!instance) {
    instance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2",
      forceTLS: true,
      authEndpoint: "/api/pusher/auth",
      auth: { headers: { "X-Requested-With": "XMLHttpRequest" } },
    });
  }
  return instance;
}

export function disconnectPusher() {
  instance?.disconnect();
  instance = null;
}

/** পাঠানোর সময় এই id দিলে নিজের ট্যাবে নিজের event ফিরে আসে না */
export function socketId() {
  return instance?.connection.socket_id;
}

export const CH = {
  user: (userId: string) => `private-user-${userId}`,
  convo: (convId: string) => `presence-convo-${convId}`,
};
