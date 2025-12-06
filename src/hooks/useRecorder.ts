import { useState, useRef, useCallback } from 'react';

export interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
}

export interface UseRecorderReturn {
  state: RecorderState;
  startRecording: (videoElement: HTMLVideoElement, filename?: string) => void;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const filenameRef = useRef<string>('recording');

  const updateDuration = useCallback(() => {
    setState(prev => ({ ...prev, duration: prev.duration + 1 }));
  }, []);

  const startRecording = useCallback((videoElement: HTMLVideoElement, filename = 'recording') => {
    try {
      // Clear previous state
      chunksRef.current = [];
      filenameRef.current = filename;

      // Try to capture the video stream
      let stream: MediaStream;

      // Check if video has captureStream method (works for direct video sources)
      if ('captureStream' in videoElement && typeof videoElement.captureStream === 'function') {
        stream = (videoElement as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
      } else if ('mozCaptureStream' in videoElement && typeof (videoElement as unknown as { mozCaptureStream: () => MediaStream }).mozCaptureStream === 'function') {
        // Firefox fallback
        stream = (videoElement as unknown as { mozCaptureStream: () => MediaStream }).mozCaptureStream();
      } else {
        throw new Error('Recording is not supported in this browser');
      }

      // Check for supported MIME types
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported video format found for recording');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 5000000, // 5 Mbps
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenameRef.current}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setState({
          isRecording: false,
          isPaused: false,
          duration: 0,
          error: null,
        });
      };

      mediaRecorder.onerror = () => {
        setState(prev => ({
          ...prev,
          isRecording: false,
          error: 'Recording error occurred',
        }));
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Capture in 1-second chunks

      // Start duration timer
      timerRef.current = window.setInterval(updateDuration, 1000);

      setState({
        isRecording: true,
        isPaused: false,
        duration: 0,
        error: null,
      });
    } catch (error) {
      setState({
        isRecording: false,
        isPaused: false,
        duration: 0,
        error: error instanceof Error ? error.message : 'Failed to start recording',
      });
    }
  }, [updateDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [state.isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = window.setInterval(updateDuration, 1000);
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused, updateDuration]);

  return {
    state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
