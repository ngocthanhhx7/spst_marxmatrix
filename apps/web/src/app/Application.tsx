import { Providers } from './providers.js';
import { AppRouter } from './router.js';

export default function Application() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}
