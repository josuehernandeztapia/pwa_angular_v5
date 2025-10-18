import { Injectable } from '@angular/core';
import { safeWindow } from '@services/utils/ssr/safe-window.util';

@Injectable({
  providedIn: 'root'
})
export class MediaPermissionsService {
  private hasRequestedPermissions = false;

  async requestCameraAndMicrophonePermissions(): Promise<{camera: boolean, microphone: boolean}> {
    if (this.hasRequestedPermissions) {
      return this.checkPermissions();
    }

    const navigatorRef = safeWindow()?.navigator;
    const mediaDevices = navigatorRef?.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      return { camera: false, microphone: false };
    }

    try {
      const stream = await mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      // Immediately stop all tracks to release the devices
      stream.getTracks().forEach(track => track.stop());
      
      this.hasRequestedPermissions = true;
      return { camera: true, microphone: true };
    } catch (error) {
      
      // Try individual permissions
      const results = { camera: false, microphone: false };

      try {
        const videoStream = await mediaDevices.getUserMedia({ video: true });
        videoStream.getTracks().forEach(track => track.stop());
        results.camera = true;
      } catch {}

      try {
        const audioStream = await mediaDevices.getUserMedia({ audio: true });
        audioStream.getTracks().forEach(track => track.stop());
        results.microphone = true;
      } catch {}
      
      this.hasRequestedPermissions = true;
      return results;
    }
  }

  async checkPermissions(): Promise<{camera: boolean, microphone: boolean}> {
    const results = { camera: false, microphone: false };
    const navigatorRef = safeWindow()?.navigator;
    const permissions = navigatorRef?.permissions;

    try {
      // Check camera permission
      const cameraPermission = await permissions?.query({ name: 'camera' as PermissionName });
      results.camera = cameraPermission?.state === 'granted';
    } catch {}

    try {
      // Check microphone permission
      const micPermission = await permissions?.query({ name: 'microphone' as PermissionName });
      results.microphone = micPermission?.state === 'granted';
    } catch {}

    return results;
  }

  isSupported(): boolean {
    const navigatorRef = safeWindow()?.navigator;
    return !!(navigatorRef?.mediaDevices && navigatorRef.mediaDevices.getUserMedia);
  }
}
