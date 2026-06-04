import { registerRootComponent } from 'expo';
import { enableFreeze } from 'react-native-screens';

// Activate react-native-screens' freeze. The tab navigator already sets
// `freezeOnBlur: true`, but per react-navigation's docs that option is a no-op
// unless enableFreeze() is called here — without it every inactive screen keeps
// re-rendering in the background, adding CPU contention (and transition lag) when
// switching tabs. This makes the configured freeze actually take effect.
enableFreeze(true);

import App from '@app/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
