import { configure } from '@testing-library/react';

// Тесты компонентов идут параллельно с остальными пакетами; на загруженной машине секунды по умолчанию мало.
configure({ asyncUtilTimeout: 4000 });
