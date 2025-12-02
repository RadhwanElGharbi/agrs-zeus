/**
 * AGRS Digital Twin - Pixel Streaming Client
 * 
 * WebRTC client for connecting to UE5 Pixel Streaming via the signaling server.
 * Handles video/audio streaming and data channel communication.
 */

export interface PixelStreamingConfig {
  signalingUrl: string;
  onVideoReady?: (video: HTMLVideoElement) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onStreamerConnected?: () => void;
  onStreamerDisconnected?: () => void;
  onDataChannelMessage?: (message: any) => void;
}

export interface StreamingStats {
  connected: boolean;
  streamerConnected: boolean;
  playerId: string | null;
  videoWidth: number;
  videoHeight: number;
  frameRate: number;
  bitrate: number;
  latency: number;
}

export class PixelStreamingClient {
  private config: PixelStreamingConfig;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private playerId: string | null = null;
  private streamerConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private inputElement: HTMLElement | null = null;
  private inputHandlers: { [key: string]: (e: Event) => void } = {};
  
  // Mouse sensitivity multiplier - increase for faster camera movement
  public mouseSensitivity: number = 1.0;

  constructor(config: PixelStreamingConfig) {
    this.config = config;
  }

  /**
   * Connect to the signaling server and wait for streamer
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // UE5's embedded signaling server expects /ws path if not specified
        let url = this.config.signalingUrl;
        if (!url.endsWith('/ws') && !url.includes('?')) {
          url = url.replace(/\/$/, '') + '/ws';
        }
        
        console.log('[PixelStreaming] Connecting to signaling server:', url);
        
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('[PixelStreaming] WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = async (event) => {
          try {
            let data: string;
            
            // Handle both string and Blob messages
            if (event.data instanceof Blob) {
              data = await event.data.text();
            } else {
              data = event.data;
            }
            
            // Only parse if it looks like JSON
            if (data.startsWith('{') || data.startsWith('[')) {
              this.handleSignalingMessage(JSON.parse(data));
            } else {
              console.log('[PixelStreaming] Non-JSON message:', data.substring(0, 100));
            }
          } catch (e) {
            console.warn('[PixelStreaming] Failed to parse message:', e);
          }
        };
        
        this.ws.onclose = (event) => {
          console.log('[PixelStreaming] WebSocket closed:', event.code, event.reason);
          this.handleDisconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('[PixelStreaming] WebSocket error:', error);
          this.config.onError?.('WebSocket connection failed');
          reject(error);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from streaming
   */
  disconnect(): void {
    console.log('[PixelStreaming] Disconnecting...');
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.playerId = null;
    this.streamerConnected = false;
  }

  /**
   * Enable input handling on an element (mouse/keyboard passthrough to UE5)
   */
  enableInput(element: HTMLElement): void {
    this.inputElement = element;
    
    // Mouse events
    this.inputHandlers['mousedown'] = (e) => this.handleMouseButton(e as MouseEvent, true);
    this.inputHandlers['mouseup'] = (e) => this.handleMouseButton(e as MouseEvent, false);
    this.inputHandlers['mousemove'] = (e) => this.handleMouseMove(e as MouseEvent);
    this.inputHandlers['wheel'] = (e) => this.handleMouseWheel(e as WheelEvent);
    this.inputHandlers['mouseenter'] = (e) => this.handleMouseEnter(e as MouseEvent);
    this.inputHandlers['mouseleave'] = (e) => this.handleMouseLeave(e as MouseEvent);
    this.inputHandlers['contextmenu'] = (e) => e.preventDefault();
    
    // Keyboard events
    this.inputHandlers['keydown'] = (e) => this.handleKeyboard(e as KeyboardEvent, true);
    this.inputHandlers['keyup'] = (e) => this.handleKeyboard(e as KeyboardEvent, false);
    
    // Register handlers
    Object.entries(this.inputHandlers).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });
    
    // Make focusable for keyboard events
    element.tabIndex = 0;
    element.focus();
    
    // Request pointer lock for better mouse control (click to activate, Esc to release)
    element.addEventListener('dblclick', () => {
      if (!document.pointerLockElement) {
        element.requestPointerLock?.();
        console.log('[PixelStreaming] Pointer lock requested (double-click to lock, Esc to release)');
      }
    });
    
    // Handle pointer lock changes
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === element) {
        console.log('[PixelStreaming] Pointer locked - mouse captured for camera control');
      } else {
        console.log('[PixelStreaming] Pointer unlocked');
      }
    });
    
    console.log('[PixelStreaming] Input enabled (double-click to lock mouse for camera control)');
  }

  /**
   * Disable input handling
   */
  disableInput(): void {
    if (this.inputElement) {
      Object.entries(this.inputHandlers).forEach(([event, handler]) => {
        this.inputElement!.removeEventListener(event, handler);
      });
      this.inputElement = null;
      this.inputHandlers = {};
      console.log('[PixelStreaming] Input disabled');
    }
  }

  /**
   * Send data to UE5 via data channel
   */
  sendDataChannelMessage(message: any): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      this.dataChannel.send(payload);
    } else {
      console.warn('[PixelStreaming] Data channel not ready');
    }
  }

  /**
   * Send a UI interaction (mouse, keyboard) to UE5
   */
  sendUIInteraction(descriptor: any): void {
    this.sendDataChannelMessage({
      type: 'UIInteraction',
      descriptor
    });
  }

  /**
   * Send custom command to UE5 application
   */
  sendCommand(command: string, args?: any): void {
    this.sendDataChannelMessage({
      type: 'Command',
      command,
      args
    });
  }

  /**
   * Get current video element
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get streaming statistics
   */
  async getStats(): Promise<StreamingStats> {
    const stats: StreamingStats = {
      connected: this.ws?.readyState === WebSocket.OPEN,
      streamerConnected: this.streamerConnected,
      playerId: this.playerId,
      videoWidth: this.videoElement?.videoWidth || 0,
      videoHeight: this.videoElement?.videoHeight || 0,
      frameRate: 0,
      bitrate: 0,
      latency: 0
    };

    if (this.pc) {
      try {
        const rtcStats = await this.pc.getStats();
        rtcStats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            stats.frameRate = report.framesPerSecond || 0;
            stats.bitrate = (report.bytesReceived * 8) / 1000; // kbps approximation
          }
        });
      } catch (e) {
        console.warn('[PixelStreaming] Failed to get stats:', e);
      }
    }

    return stats;
  }

  // ============================================================================
  // Input Handlers - UE5 Pixel Streaming Binary Protocol
  // ============================================================================

  // UE5 Pixel Streaming message types
  private static readonly MessageType = {
    // Input
    KeyDown: 60,
    KeyUp: 61,
    KeyPress: 62,
    MouseEnter: 70,
    MouseLeave: 71,
    MouseDown: 72,
    MouseUp: 73,
    MouseMove: 74,
    MouseWheel: 75,
    MouseDouble: 76,
    TouchStart: 80,
    TouchEnd: 81,
    TouchMove: 82,
    // Commands
    UIInteraction: 50,
    Command: 51,
    // Gamepad
    GamepadButtonPressed: 90,
    GamepadButtonReleased: 91,
    GamepadAnalog: 92,
  };

  private sendInputMessage(buffer: ArrayBuffer): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(buffer);
    } else {
      // Silently ignore - data channel not ready yet
      // This can happen during initial connection
    }
  }

  private handleMouseButton(e: MouseEvent, isDown: boolean): void {
    e.preventDefault();
    const rect = this.inputElement?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // UE5 expects: type (1 byte) + button (1 byte) + x (2 bytes) + y (2 bytes)
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, isDown ? PixelStreamingClient.MessageType.MouseDown : PixelStreamingClient.MessageType.MouseUp);
    view.setUint8(1, e.button);
    view.setUint16(2, Math.round(x * 65535), true); // little-endian
    view.setUint16(4, Math.round(y * 65535), true);
    
    this.sendInputMessage(buffer);
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.inputElement?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Clamp position to valid range
    const posX = Math.max(0, Math.min(65535, Math.round(x * 65535)));
    const posY = Math.max(0, Math.min(65535, Math.round(y * 65535)));
    
    // Apply sensitivity multiplier to raw mouse deltas
    // Default UE5 Pixel Streaming expects raw pixel deltas, but we may need to scale
    // for network streaming where responsiveness matters
    const deltaX = Math.round(e.movementX * this.mouseSensitivity);
    const deltaY = Math.round(e.movementY * this.mouseSensitivity);

    // UE5 expects: type (1 byte) + x (2 bytes) + y (2 bytes) + deltaX (2 bytes) + deltaY (2 bytes)
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, PixelStreamingClient.MessageType.MouseMove);
    view.setUint16(1, posX, true);
    view.setUint16(3, posY, true);
    view.setInt16(5, deltaX, true);
    view.setInt16(7, deltaY, true);
    
    this.sendInputMessage(buffer);
  }

  // Also add mouse enter/leave for proper focus handling
  private handleMouseEnter(e: MouseEvent): void {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, PixelStreamingClient.MessageType.MouseEnter);
    this.sendInputMessage(buffer);
  }

  private handleMouseLeave(e: MouseEvent): void {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, PixelStreamingClient.MessageType.MouseLeave);
    this.sendInputMessage(buffer);
  }

  private handleMouseWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.inputElement?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // UE5 expects: type (1 byte) + delta (2 bytes) + x (2 bytes) + y (2 bytes)
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0, PixelStreamingClient.MessageType.MouseWheel);
    view.setInt16(1, Math.round(e.deltaY), true);
    view.setUint16(3, Math.round(x * 65535), true);
    view.setUint16(5, Math.round(y * 65535), true);
    
    this.sendInputMessage(buffer);
  }

  private handleKeyboard(e: KeyboardEvent, isDown: boolean): void {
    // Allow browser shortcuts (Ctrl+R, F5, etc.)
    if (e.ctrlKey || e.metaKey) return;
    
    e.preventDefault();
    
    // UE5 expects: type (1 byte) + keyCode (1 byte) + repeat (1 byte)
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, isDown ? PixelStreamingClient.MessageType.KeyDown : PixelStreamingClient.MessageType.KeyUp);
    view.setUint8(1, e.keyCode);
    view.setUint8(2, e.repeat ? 1 : 0);
    
    this.sendInputMessage(buffer);
  }

  // ============================================================================
  // Private Methods - Signaling
  // ============================================================================

  private handleSignalingMessage(message: any): void {
    const { type } = message;
    
    console.log('[PixelStreaming] Received message type:', type, message);
    
    switch (type) {
      case 'config':
        // UE5 sends config with peerConnectionOptions
        this.playerId = message.playerId || 'player_' + Date.now();
        console.log('[PixelStreaming] Received config, playerId:', this.playerId);
        
        // Store peer connection options if provided
        if (message.peerConnectionOptions) {
          console.log('[PixelStreaming] Got peerConnectionOptions:', message.peerConnectionOptions);
        }
        
        // Create peer connection first
        this.createPeerConnection();
        
        // For UE5 embedded server, we need to request the stream
        // Send a subscribe message to start receiving the stream
        this.sendSignalingMessage({ type: 'listStreamers' });
        break;
      
      case 'streamerList':
        // Response to listStreamers - subscribe to the first one
        console.log('[PixelStreaming] Streamer list:', message.ids);
        if (message.ids && message.ids.length > 0) {
          const streamerId = message.ids[0];
          console.log('[PixelStreaming] Subscribing to streamer:', streamerId);
          this.sendSignalingMessage({ type: 'subscribe', streamerId });
        } else {
          // No streamer list, try direct subscribe
          console.log('[PixelStreaming] No streamer list, sending direct subscribe');
          this.sendSignalingMessage({ type: 'subscribe' });
        }
        this.streamerConnected = true;
        this.config.onStreamerConnected?.();
        break;
      
      case 'playerCount':
        // UE5 sends player count updates
        console.log('[PixelStreaming] Player count:', message.count);
        break;
        
      case 'streamerConnected':
        console.log('[PixelStreaming] Streamer connected');
        this.streamerConnected = true;
        this.config.onStreamerConnected?.();
        if (!this.pc) {
          this.createPeerConnection();
        }
        break;
        
      case 'streamerDisconnected':
        console.log('[PixelStreaming] Streamer disconnected');
        this.streamerConnected = false;
        this.config.onStreamerDisconnected?.();
        break;
        
      case 'offer':
        this.handleOffer(message);
        break;
        
      case 'answer':
        this.handleAnswer(message);
        break;
        
      case 'iceCandidate':
        this.handleIceCandidate(message);
        break;
      
      case 'ping':
        // UE5 sends pings - respond with pong
        this.sendSignalingMessage({ type: 'pong', time: message.time });
        break;
        
      case 'pong':
        // Response to our ping
        break;
        
      default:
        console.log('[PixelStreaming] Unknown message type:', type, message);
    }
  }

  private createPeerConnection(): void {
    if (this.pc) {
      this.pc.close();
    }

    console.log('[PixelStreaming] Creating peer connection');

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      // Needed for some network configurations
      iceCandidatePoolSize: 10
    };

    this.pc = new RTCPeerConnection(config);

    // Handle incoming tracks (video/audio from UE5)
    this.pc.ontrack = (event) => {
      console.log('[PixelStreaming] Received track:', event.track.kind, 'streams:', event.streams?.length);
      
      if (event.track.kind === 'video') {
        if (!this.videoElement) {
          this.videoElement = document.createElement('video');
          this.videoElement.autoplay = true;
          this.videoElement.playsInline = true;
          this.videoElement.muted = true;
          this.videoElement.style.width = '100%';
          this.videoElement.style.height = '100%';
          this.videoElement.style.objectFit = 'contain';
        }
        
        // Use the stream from the event
        if (event.streams && event.streams[0]) {
          console.log('[PixelStreaming] Setting video srcObject from stream');
          this.videoElement.srcObject = event.streams[0];
        } else {
          // Create a new MediaStream with just this track
          console.log('[PixelStreaming] Creating new MediaStream for video track');
          const stream = new MediaStream([event.track]);
          this.videoElement.srcObject = stream;
        }
        
        // Wait for video to be ready
        this.videoElement.onloadedmetadata = () => {
          console.log('[PixelStreaming] Video metadata loaded:', 
            this.videoElement?.videoWidth, 'x', this.videoElement?.videoHeight);
          this.videoElement?.play().catch(e => console.warn('[PixelStreaming] Video play failed:', e));
        };
        
        this.videoElement.onplaying = () => {
          console.log('[PixelStreaming] Video playing:', 
            this.videoElement?.videoWidth, 'x', this.videoElement?.videoHeight);
          this.config.onConnected?.();
        };
        
        this.config.onVideoReady?.(this.videoElement);
        
        // Try to play immediately as well
        this.videoElement.play().catch(e => console.warn('[PixelStreaming] Initial play failed:', e));
      }
    };

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      console.log('[PixelStreaming] ICE candidate:', event.candidate?.candidate?.substring(0, 50));
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'iceCandidate',
          candidate: event.candidate
        });
      }
    };

    // Handle ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      console.log('[PixelStreaming] ICE connection state:', this.pc?.iceConnectionState);
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log('[PixelStreaming] Connection state:', this.pc?.connectionState);
      
      if (this.pc?.connectionState === 'connected') {
        console.log('[PixelStreaming] WebRTC connected!');
      } else if (this.pc?.connectionState === 'disconnected' || 
          this.pc?.connectionState === 'failed') {
        this.config.onDisconnected?.();
      }
    };

    // Handle data channel from UE5
    this.pc.ondatachannel = (event) => {
      console.log('[PixelStreaming] Data channel received:', event.channel.label);
      this.setupDataChannel(event.channel);
    };

    // DON'T create an offer - wait for UE5 to send us an offer
    // UE5's Pixel Streaming is the offerer, we are the answerer
    console.log('[PixelStreaming] Peer connection ready, waiting for offer from UE5');
  }

  private async handleOffer(message: any): Promise<void> {
    console.log('[PixelStreaming] Received offer from UE5');
    
    if (!this.pc) {
      this.createPeerConnection();
    }

    try {
      // Set the remote description (the offer from UE5)
      await this.pc!.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: message.sdp
      }));
      console.log('[PixelStreaming] Remote description set');

      // Create our answer
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      console.log('[PixelStreaming] Local description set, sending answer');

      // Send answer back to UE5
      this.sendSignalingMessage({
        type: 'answer',
        sdp: answer.sdp
      });
    } catch (error) {
      console.error('[PixelStreaming] Failed to handle offer:', error);
      this.config.onError?.('Failed to handle WebRTC offer: ' + error);
    }
  }

  private async handleAnswer(message: any): Promise<void> {
    if (!this.pc) return;

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: message.sdp
      }));
    } catch (error) {
      console.error('[PixelStreaming] Failed to handle answer:', error);
    }
  }

  private async handleIceCandidate(message: any): Promise<void> {
    if (!this.pc) return;

    try {
      if (message.candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    } catch (error) {
      console.error('[PixelStreaming] Failed to add ICE candidate:', error);
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    console.log('[PixelStreaming] Setting up data channel:', channel.label, 'state:', channel.readyState);
    
    channel.onopen = () => {
      console.log('[PixelStreaming] Data channel opened:', channel.label);
      // Use this channel for input if it's UE5's channel
      if (channel.label === 'datachannel' || channel.label === 'cirrus' || !this.dataChannel || this.dataChannel.readyState !== 'open') {
        this.dataChannel = channel;
        console.log('[PixelStreaming] Using data channel for input:', channel.label);
      }
    };

    channel.onclose = () => {
      console.log('[PixelStreaming] Data channel closed:', channel.label);
    };

    channel.onmessage = (event) => {
      try {
        // UE5 can send binary or text messages
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          // Binary message from UE5 - could be response to input
          return;
        }
        const data = JSON.parse(event.data);
        this.config.onDataChannelMessage?.(data);
      } catch {
        // Non-JSON message - might be a command response
        this.config.onDataChannelMessage?.(event.data);
      }
    };

    channel.onerror = (error) => {
      console.error('[PixelStreaming] Data channel error:', error);
    };

    // Prefer UE5's data channel over our own
    if (channel.label === 'datachannel' || channel.label === 'cirrus') {
      this.dataChannel = channel;
    } else if (!this.dataChannel) {
      this.dataChannel = channel;
    }
  }

  private sendSignalingMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleDisconnect(): void {
    this.streamerConnected = false;
    this.config.onDisconnected?.();

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[PixelStreaming] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('[PixelStreaming] Reconnection failed:', error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }
}

/**
 * Create a Pixel Streaming client instance
 */
export function createPixelStreamingClient(config: PixelStreamingConfig): PixelStreamingClient {
  return new PixelStreamingClient(config);
}

