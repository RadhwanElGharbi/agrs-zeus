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

  constructor(config: PixelStreamingConfig) {
    this.config = config;
  }

  /**
   * Connect to the signaling server and wait for streamer
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[PixelStreaming] Connecting to signaling server:', this.config.signalingUrl);
        
        this.ws = new WebSocket(this.config.signalingUrl);
        
        this.ws.onopen = () => {
          console.log('[PixelStreaming] WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleSignalingMessage(JSON.parse(event.data));
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
    
    console.log('[PixelStreaming] Input enabled');
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
  // Input Handlers
  // ============================================================================

  private handleMouseButton(e: MouseEvent, isDown: boolean): void {
    e.preventDefault();
    const rect = this.inputElement?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    this.sendDataChannelMessage({
      type: isDown ? 'MouseDown' : 'MouseUp',
      button: e.button,
      x: Math.round(x * 65535),
      y: Math.round(y * 65535)
    });
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.inputElement?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    this.sendDataChannelMessage({
      type: 'MouseMove',
      x: Math.round(x * 65535),
      y: Math.round(y * 65535),
      deltaX: e.movementX,
      deltaY: e.movementY
    });
  }

  private handleMouseWheel(e: WheelEvent): void {
    e.preventDefault();
    this.sendDataChannelMessage({
      type: 'MouseWheel',
      delta: Math.sign(e.deltaY) * -120
    });
  }

  private handleKeyboard(e: KeyboardEvent, isDown: boolean): void {
    // Allow browser shortcuts (Ctrl+R, F5, etc.)
    if (e.ctrlKey || e.metaKey) return;
    
    e.preventDefault();
    this.sendDataChannelMessage({
      type: isDown ? 'KeyDown' : 'KeyUp',
      keyCode: e.keyCode,
      repeat: e.repeat
    });
  }

  // ============================================================================
  // Private Methods - Signaling
  // ============================================================================

  private handleSignalingMessage(message: any): void {
    const { type } = message;
    
    switch (type) {
      case 'config':
        this.playerId = message.playerId;
        this.streamerConnected = message.streamerConnected;
        console.log('[PixelStreaming] Received config, playerId:', this.playerId);
        
        if (this.streamerConnected) {
          this.config.onStreamerConnected?.();
          this.createPeerConnection();
        }
        break;
        
      case 'streamerConnected':
        console.log('[PixelStreaming] Streamer connected');
        this.streamerConnected = true;
        this.config.onStreamerConnected?.();
        this.createPeerConnection();
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
        
      default:
        console.log('[PixelStreaming] Unknown message type:', type);
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
      ]
    };

    this.pc = new RTCPeerConnection(config);

    // Handle incoming tracks (video/audio from UE5)
    this.pc.ontrack = (event) => {
      console.log('[PixelStreaming] Received track:', event.track.kind);
      
      if (event.track.kind === 'video') {
        if (!this.videoElement) {
          this.videoElement = document.createElement('video');
          this.videoElement.autoplay = true;
          this.videoElement.playsInline = true;
          this.videoElement.muted = true; // Start muted (can unmute later)
        }
        
        this.videoElement.srcObject = event.streams[0];
        this.config.onVideoReady?.(this.videoElement);
        this.config.onConnected?.();
      }
    };

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'iceCandidate',
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log('[PixelStreaming] Connection state:', this.pc?.connectionState);
      
      if (this.pc?.connectionState === 'disconnected' || 
          this.pc?.connectionState === 'failed') {
        this.config.onDisconnected?.();
      }
    };

    // Handle data channel from UE5
    this.pc.ondatachannel = (event) => {
      console.log('[PixelStreaming] Data channel received:', event.channel.label);
      this.setupDataChannel(event.channel);
    };

    // Create offer to initiate connection
    this.createOffer();
  }

  private async createOffer(): Promise<void> {
    if (!this.pc) return;

    try {
      // Add transceivers for receiving video/audio
      this.pc.addTransceiver('video', { direction: 'recvonly' });
      this.pc.addTransceiver('audio', { direction: 'recvonly' });

      // Create data channel for sending commands to UE5
      this.dataChannel = this.pc.createDataChannel('agrs-data', { ordered: true });
      this.setupDataChannel(this.dataChannel);

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.sendSignalingMessage({
        type: 'offer',
        sdp: offer.sdp
      });
    } catch (error) {
      console.error('[PixelStreaming] Failed to create offer:', error);
      this.config.onError?.('Failed to create WebRTC offer');
    }
  }

  private async handleOffer(message: any): Promise<void> {
    if (!this.pc) {
      this.createPeerConnection();
    }

    try {
      await this.pc!.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: message.sdp
      }));

      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);

      this.sendSignalingMessage({
        type: 'answer',
        sdp: answer.sdp
      });
    } catch (error) {
      console.error('[PixelStreaming] Failed to handle offer:', error);
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
    channel.onopen = () => {
      console.log('[PixelStreaming] Data channel opened');
    };

    channel.onclose = () => {
      console.log('[PixelStreaming] Data channel closed');
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.config.onDataChannelMessage?.(data);
      } catch {
        // Non-JSON message
        this.config.onDataChannelMessage?.(event.data);
      }
    };

    channel.onerror = (error) => {
      console.error('[PixelStreaming] Data channel error:', error);
    };

    if (channel.label === 'agrs-data' || !this.dataChannel) {
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

