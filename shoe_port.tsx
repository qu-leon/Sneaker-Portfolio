import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  NativeModules,
  View,
} from 'react-native';

type SneakerEntry = {
  id: string;
  shoeName: string;
  size: string;
  purchaseDate: string;
  purchasePrice: number;
  imageUrl: string;
};

const STORAGE_KEY = 'sneaker-portfolio-entries-v1';
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';

const getSneaksApiBaseUrl = () => {
  const scriptUrl = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (scriptUrl) {
    try {
      const bundleUrl = new URL(scriptUrl);
      return `http://${bundleUrl.hostname}:4000`;
    } catch {
      return 'http://localhost:4000';
    }
  }

  return 'http://localhost:4000';
};

export default function App() {
  const [shoeName, setShoeName] = useState('');
  const [size, setSize] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [entries, setEntries] = useState<SneakerEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadEntries = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SneakerEntry[];
          setEntries(parsed);
        }
      } catch {
        Alert.alert('Storage error', 'Could not load your portfolio from local storage.');
      } finally {
        setIsLoading(false);
      }
    };

    loadEntries();
  }, []);

  const totalInvested = useMemo(
    () => entries.reduce((sum: number, entry: SneakerEntry) => sum + entry.purchasePrice, 0),
    [entries]
  );

  const persistEntries = async (nextEntries: SneakerEntry[]) => {
    setEntries(nextEntries);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  };

  const findSneakerImage = async (query: string): Promise<string> => {
    try {
      const apiBaseUrl = getSneaksApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/search-image?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        return FALLBACK_IMAGE;
      }

      const data = await response.json();
      const imageUrl = data?.imageUrl;
      if (!imageUrl || typeof imageUrl !== 'string') {
        return FALLBACK_IMAGE;
      }

      return imageUrl;
    } catch {
      return FALLBACK_IMAGE;
    }
  };

  const onAddEntry = async () => {
    if (!shoeName.trim() || !size.trim() || !purchaseDate.trim() || !purchasePrice.trim()) {
      Alert.alert('Missing fields', 'Please fill in shoe, size, purchase date, and purchase price.');
      return;
    }

    const parsedPrice = Number(purchasePrice);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Invalid price', 'Purchase price must be a positive number.');
      return;
    }

    setIsSaving(true);
    try {
      const imageUrl = await findSneakerImage(shoeName.trim());
      const newEntry: SneakerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shoeName: shoeName.trim(),
        size: size.trim(),
        purchaseDate: purchaseDate.trim(),
        purchasePrice: parsedPrice,
        imageUrl,
      };

      const nextEntries = [newEntry, ...entries];
      await persistEntries(nextEntries);

      setShoeName('');
      setSize('');
      setPurchaseDate('');
      setPurchasePrice('');
    } catch {
      Alert.alert('Save failed', 'Could not save this portfolio entry.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderEntry: ListRenderItem<SneakerEntry> = ({ item }: { item: SneakerEntry }) => (
    <View style={styles.entryCard}>
      <Image
        source={{ uri: item.imageUrl || FALLBACK_IMAGE }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.entryInfo}>
        <Text style={styles.shoeName}>{item.shoeName}</Text>
        <Text style={styles.meta}>Size: {item.size}</Text>
        <Text style={styles.meta}>Date: {item.purchaseDate}</Text>
        <Text style={styles.price}>Paid: ${item.purchasePrice.toFixed(2)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <Text style={styles.title}>Sneaker Portfolio</Text>

        <View style={styles.formCard}>
          <TextInput
            placeholder="Shoe name (e.g. Jordan 1 Chicago)"
            value={shoeName}
            onChangeText={setShoeName}
            style={styles.input}
          />
          <TextInput
            placeholder="Size"
            value={size}
            onChangeText={setSize}
            style={styles.input}
          />
          <TextInput
            placeholder="Purchase date (YYYY-MM-DD)"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            style={styles.input}
          />
          <TextInput
            placeholder="Purchase price"
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Pressable style={styles.addButton} onPress={onAddEntry} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.addButtonText}>Add to Portfolio</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.summary}>
          {entries.length} pair{entries.length === 1 ? '' : 's'} • Total invested: ${totalInvested.toFixed(2)}
        </Text>

        {isLoading ? (
          <ActivityIndicator size="large" style={styles.loader} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item: SneakerEntry) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No shoes yet. Add your first pair above.</Text>
            }
            renderItem={renderEntry}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  addButton: {
    marginTop: 4,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  summary: {
    fontSize: 14,
    color: '#475467',
    marginBottom: 8,
  },
  loader: {
    marginTop: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#667085',
  },
  entryCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#e4e7ec',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  shoeName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  meta: {
    color: '#475467',
    marginBottom: 2,
  },
  price: {
    marginTop: 2,
    fontWeight: '600',
  },
});
