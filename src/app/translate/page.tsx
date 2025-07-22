// src/app/translate/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next'; // 1. Импортируем хук

export default function TranslatePage() {
  const { t } = useTranslation(); // 2. Инициализируем t
  const { toast } = useToast();
  const [selectedLang, setSelectedLang] = useState('ru');
  const [baseTranslations, setBaseTranslations] = useState<
    Record<string, string>
  >({});
  const [editTranslations, setEditTranslations] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 🛡️ Хук для защиты от гидратации
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const fetchTranslations = async () => {
      setIsLoading(true);
      try {
        const enDocRef = doc(db, 'translations', 'en');
        const enDocSnap = await getDoc(enDocRef);
        const enData = enDocSnap.exists() ? enDocSnap.data() : {};
        setBaseTranslations(enData);

        const langDocRef = doc(db, 'translations', selectedLang);
        const langDocSnap = await getDoc(langDocRef);
        const langData = langDocSnap.exists() ? langDocSnap.data() : {};
        setEditTranslations(langData);
      } catch (error) {
        console.error('Error fetching translations:', error);
        toast({ title: t('Loading error'), variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTranslations();
  }, [selectedLang, toast, t]);

  const handleInputChange = (key: string, value: string) => {
    setEditTranslations((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'translations', selectedLang);
      await setDoc(docRef, editTranslations, { merge: true });
      toast({ title: t('Translations saved!') });
    } catch (error) {
      console.error('Error saving translations:', error);
      toast({ title: t('Saving error'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredKeys = Object.keys(baseTranslations).filter(
    (key) =>
      key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (baseTranslations[key] || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  // 🛡️ "Страж" гидратации
  if (!hasMounted) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Translation Editor')}</CardTitle>
            <div className='flex items-center gap-4 mt-4'>
              <Select value={selectedLang} onValueChange={setSelectedLang}>
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder={t('Select language')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ru'>{t('Russian')}</SelectItem>
                  <SelectItem value='fi'>{t('Finnish')}</SelectItem>
                  <SelectItem value='ko'>{t('Korean')}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={t('Search by key or text...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='max-w-sm'
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>{t('Loading...')}</p>
            ) : (
              <div className='max-h-[60vh] overflow-y-auto'>
                <Table>
                  <TableHeader className='sticky top-0 bg-card'>
                    <TableRow>
                      <TableHead className='w-[40%]'>
                        {t('Original (EN)')}
                      </TableHead>
                      <TableHead className='w-[60%]'>
                        {t('Translation')} ({selectedLang.toUpperCase()})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKeys.map((key) => (
                      <TableRow key={key}>
                        <TableCell className='font-mono text-xs text-muted-foreground align-top pt-4'>
                          <div>{key}</div>
                          <div className='text-gray-400 italic mt-1'>
                            {baseTranslations[key]}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editTranslations[key] || ''}
                            onChange={(e) =>
                              handleInputChange(key, e.target.value)
                            }
                            placeholder={t('Enter translation')}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className='mt-6 flex justify-end'>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? t('Saving...') : t('Save all changes')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
