// Browser adapter for KaraK's existing renderer. Audio remains in this tab;
// exported project JSON stores its filename and asks for it again when reopened.
(() => {
  let audioFile = null;
  let audioUrl = null;
  const audioInput = document.getElementById('audioFileInput');
  const textInput = document.getElementById('textFileInput');
  const projectInput = document.getElementById('projectFileInput');
  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const readFile = (input) => new Promise((resolve, reject) => {
    input.onchange = () => {
      const file = input.files?.[0]; input.value = '';
      file ? resolve(file) : resolve(null);
    };
    input.click();
  });
  window.api = {
    openAudio: async () => {
      const file = await readFile(audioInput); if (!file) return null;
      audioFile = file;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(file);
      return file.name;
    },
    audioURL: async (name) => audioFile?.name === name ? audioUrl : '',
    openText: async () => {
      const file = await readFile(textInput); return file ? { text: await file.text() } : null;
    },
    openProject: async () => {
      const file = await readFile(projectInput); if (!file) return null;
      return { data: JSON.parse(await file.text()), path: file.name };
    },
    saveProject: async (data) => {
      download('KaraK-projet.json', JSON.stringify(data, null, 2), 'application/json');
      return 'KaraK-projet.json';
    },
    saveProjectAs: async (data) => {
      const fallback = (data.lyricsRaw || 'KaraK-projet').split(/[\\/\n]/).filter(Boolean).slice(-1)[0].slice(0, 50) || 'KaraK-projet';
      const name = `${fallback.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'KaraK-projet'}.json`;
      download(name, JSON.stringify(data, null, 2), 'application/json'); return name;
    },
    setFullscreen: async (flag) => {
      if (!flag && document.fullscreenElement) await document.exitFullscreen();
    },
    toggleFullscreen: async () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(),
    alignAudio: async () => ({ error: 'Le calage automatique est disponible uniquement dans l’application Mac. Utilisez les repères manuels dans la webapp.' }),
    cancelAlignment: async () => {}
  };
})();
