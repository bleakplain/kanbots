export function helpCommand(): number {
  const lines = [
    'kanbots — local collaboration for GitHub Issues',
    '',
    'Usage:',
    '  kanbots                Start the API server (alias for `kanbots start`)',
    '  kanbots start [--port N]  Boot the API on 127.0.0.1 (default :3737)',
    '  kanbots init           Set up kanbots in this repository',
    '  kanbots doctor         Diagnose your environment',
    '  kanbots version        Print version',
    '  kanbots help           Print this message',
    '',
    'Options:',
    '  --help, -h            Same as `kanbots help`',
    '  --version, -v         Same as `kanbots version`',
  ];
  console.log(lines.join('\n'));
  return 0;
}
