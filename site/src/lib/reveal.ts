/** Блоки, которые плавно появляются при прокрутке. Селекторы — классы компонентов сайта. */
export const REVEAL_SELECTOR = [
  '.hero__text > *', '.hero__photo', '.section__head', '.section__row', '.basic', '.card',
  '.app__text > *', '.app__phone-wrap', '.insta', '.page__head', '.rubrics', '.stub > *',
  '.article__head > *', '.article__cover', '.prose > *', '.cta', '.more__title',
].join(', ');

/** Задержка соседних блоков: каждый следующий чуть позже, но не дольше полусекунды. */
export function revealDelay(index: number): number {
  return Math.min(index, 5) * 0.08;
}
