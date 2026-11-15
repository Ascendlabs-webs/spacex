import { sound } from './audio.js';

export function setupTerminal(container, onWarpTrigger) {
  if (!container) return;

  const output = container.querySelector('.terminal-output');
  const input = container.querySelector('.terminal-input');
  const chipButtons = container.querySelectorAll('.command-chip');

  const history = [];
  let historyIndex = -1;

  const logs = [
    { text: "AETHER / FIELD RECORDER [DEMO BUILD 01]", color: "system" },
    { text: "Signal trace initialized. This is a speculative system, built for exploration.", color: "accent" },
    { text: "Type 'help' or choose a field note below.", color: "muted" }
  ];

  function printLine(text, type = "normal") {
    const line = document.createElement('div');
    line.className = `terminal-line line-${type}`;
    line.textContent = `> ${text}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
    if (output.children.length > 80) output.firstElementChild.remove();
    sound.playTick(1800);
  }

  function renderInitial() {
    output.innerHTML = '';
    logs.forEach(l => printLine(l.text, l.color));
  }

  function handleCommand(cmd) {
    const cleanCmd = cmd.trim().toLowerCase();
    if (!cleanCmd) return;

    printLine(`USER@AETHER:~$ ${cleanCmd}`, "user");
    history.push(cleanCmd);
    historyIndex = history.length;

    sound.playClick();

    switch (cleanCmd) {
      case 'help':
        printLine("AVAILABLE COMMANDS:", "accent");
        printLine("  status       - Read the latest signal", "normal");
        printLine("  diagnostics  - Trace the imagined connection", "normal");
        printLine("  warp         - Send a signal toward the constellation", "accent");
        printLine("  overclock    - Change the system clock profile", "normal");
        printLine("  clear        - Clear the field recorder", "normal");
        break;

      case 'status':
        printLine("[FIELD NOTE: SIGNAL RECEIVED]", "accent");
        printLine("• Origin: AETHER constellation", "normal");
        printLine("• Direction: beyond the mapped horizon", "normal");
        printLine("• Relay: orbital link, nominal", "normal");
        printLine("• Response: still listening", "accent");
        break;

      case 'diagnostics':
        printLine("FOLLOWING THE SIGNAL INTO THE DARK…", "system");
        setTimeout(() => printLine(">> Origin point resolved", "accent"), 180);
        setTimeout(() => printLine(">> Three relay paths found", "accent"), 360);
        setTimeout(() => printLine(">> One distant reply still unresolved", "normal"), 600);
        setTimeout(() => printLine("TRACE ENDS AT THE EDGE OF THE MAP.", "system"), 800);
        break;

      case 'warp':
        printLine("OUTBOUND BEACON: TRANSMITTING…", "system");
        sound.playWarp();
        if (onWarpTrigger) {
          setTimeout(() => onWarpTrigger(), 400);
        }
        break;

      case 'overclock':
        printLine("CLOCK PROFILE UPDATED · SIMULATION ONLY", "system");
        sound.playChord(330, 'sawtooth');
        break;

      case 'clear':
        output.innerHTML = '';
        break;

      default:
        if (cleanCmd.startsWith('extract ') || cleanCmd.startsWith('rea ')) {
          printLine("External asset ingestion is not part of this field study.", "muted");
          break;
        }
        printLine(`Command not recognized: '${cleanCmd}'. Type 'help' for manifest.`, "error");
        break;
    }
  }

  // Input event
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value;
      input.value = '';
      handleCommand(val);
    } else if (e.key === 'ArrowUp') {
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        input.value = '';
      }
    }
  });

  // Chip buttons
  chipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        input.value = cmd;
        handleCommand(cmd);
      }
    });
  });

  renderInitial();
}
