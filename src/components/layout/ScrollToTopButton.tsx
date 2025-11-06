// src/components/layout/ScrollToTopButton.tsx
'use client';

import { cn } from '@/lib/utils';
import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ScrollToTopButton() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Этот useEffect теперь сработает, так как Navbar уже в DOM
  useEffect(() => {
    const header = document.querySelector('header');
    if (header) {
      setHeaderHeight(header.clientHeight);
    }
  }, []);

  // 1. Отслеживаем прокрутку страницы
  const toggleVisibility = () => {
    // Показываем кнопку, если прокрутка больше 200px
    if (window.scrollY > 200) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  // 2. Функция плавного скролла наверх
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // 3. Добавляем и удаляем слушатель события
  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  return (
    <button
      type='button'
      onClick={scrollToTop}
      // Динамически устанавливаем top и height
      style={{
        top: `${headerHeight}px`, // 1. Начинаем ПОСЛЕ хедера
        height: `calc(100vh - ${headerHeight}px)`, // 2. Занимаем оставшуюся высоту
      }}
      className={cn(
        // --- ИСПРАВЛЕНИЕ: Классы Flexbox ---
        'flex items-start justify-center', // 'flex', 'items-start' (прижать к верху), 'justify-center'
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        'fixed left-0 z-30',
        'hidden 2xl:block',
        'w-[calc((100vw-77.5rem)/2)]', // Ширина левой пустой области
        'group transition-all duration-300',
        isVisible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none'
      )}
      aria-label={t('Scroll to top') || 'Scroll to top'}
    >
      {/* Этот div - это "визуальный блок" шириной 120px.
        Он центрируется родительским 'justify-center'.
      */}
      <div className='relative w-[120px] h-full'>
        {/* 1. Полупрозрачный фон (на всю область 120px) */}
        {/* --- ИСПРАВЛЕНИЕ: 'inset-0' здесь правильный, он заполнит 'w-[120px] h-full' --- */}
        <div className='absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-black/10 dark:bg-white/5' />

        {/* 2. Иконка и текст (приклеены к верху) */}
        <div
          className={cn(
            'sticky', // Приклеиваем к верху родителя (блока w-[120px])
            'top-5', // 'sticky' теперь работает, отступ 5px от верха
            'flex flex-row items-center justify-center gap-2', // В ряд
            'text-primary',
            'w-full', // Заполняем 120px
            'p-4'
          )}
        >
          <ArrowUp className='h-5 w-5' />
          <span className='text-sm font-semibold'>{t('Up')}</span>
        </div>
      </div>
    </button>
  );
}
