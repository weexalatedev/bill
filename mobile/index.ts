import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// It also ensures whether the environment is set up correctly for the app.
registerRootComponent(App);