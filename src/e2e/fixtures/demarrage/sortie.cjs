// Preloaded into the server: 100 000 characters on stderr, the last line naming the failure, then exit 3.
process.stderr.write('DEBUT-4471\n' + 'x'.repeat(100000) + '\nFIN-4471 impossible de demarrer\n');
process.exit(3);
