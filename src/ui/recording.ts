/** Records the actual WebGL frame, with a disclosure baked into the video. */
export function createRecording(source: HTMLCanvasElement, toast: (message: string) => void) {
  const button = document.getElementById('btn-record') as HTMLButtonElement;
  if (!('MediaRecorder' in window) || !source.captureStream) { button.hidden = true; return { frame() {} }; }
  let output: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let started = 0;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  button.addEventListener('click', () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    output = document.createElement('canvas');
    output.width = Math.min(source.width, 1440);
    output.height = Math.round(output.width * source.height / source.width);
    context = output.getContext('2d')!;
    stream = output.captureStream(30);
    const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) { toast('Recording is unavailable in this browser.'); stream.getTracks().forEach(track => track.stop()); return; }
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6500000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, {type:mime});
      stream?.getTracks().forEach(track => track.stop());
      output = null; context = null; recorder = null;
      button.textContent = 'Record 12s';
      const reader = new FileReader();
      reader.onload = () => {
        const dialog = document.createElement('dialog'); dialog.className = 'share-preview';
        dialog.innerHTML = '<div class="share-preview-content"><div class="share-preview-header"><h2>Your court replay</h2><button class="share-preview-close" aria-label="Close replay">×</button></div><video id="gameplay-recording" controls playsinline style="width:100%;max-height:65vh;background:#111"></video><div class="share-preview-footer"><p>12 seconds from the live game.<br><span>Fictional teams and demo sponsors.</span></p><a class="share-preview-save">Save replay ↓</a></div></div>';
        const data = String(reader.result);
        dialog.querySelector('video')!.src = data;
        const link = dialog.querySelector('a')!; link.href = data; link.download = `rucker-gameplay.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
        const close = () => { dialog.close(); dialog.remove(); };
        dialog.querySelector('button')!.addEventListener('click', close);
        dialog.addEventListener('cancel', event => {event.preventDefault();close();});
        document.body.append(dialog); dialog.showModal();
      };
      reader.readAsDataURL(blob);
    };
    recorder.onerror = () => { stream?.getTracks().forEach(track => track.stop()); output = null; context = null; recorder = null; button.textContent = 'Record 12s'; toast('The browser could not finish this recording.'); };
    started = performance.now(); recorder.start(1000); button.textContent = 'Stop recording';
    toast('Recording the next 12 seconds of gameplay.');
  });
  return {
    frame() {
      if (!output || !context || recorder?.state !== 'recording') return;
      context.drawImage(source, 0, 0, output.width, output.height);
      const size = Math.max(11, output.width / 105);
      context.font = `600 ${size}px sans-serif`;
      context.fillStyle = '#17211cbb'; context.fillRect(14, output.height-size*3.3, size*36, size*2.3);
      context.fillStyle = '#fff3da'; context.fillText('RUCKER PARK · FICTIONAL PICKUP GAME', 24, output.height-size*1.8);
      if (performance.now() - started >= 12000) recorder.stop();
    },
  };
}
