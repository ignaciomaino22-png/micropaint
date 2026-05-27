import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider,
  signInWithPopup, 
  signInAnonymously, 
  signOut,
  onAuthStateChanged,
  FirebaseUser,
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  getDocs
} from '../firebase';
import { UserProfile, Drawing, BanRecord } from '../types';

interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  drawings: Drawing[];
  allDrawingsAdmin: Drawing[]; // include deleted drawings for admin to view
  bans: BanRecord[];
  isBanned: boolean;
  isAdmin: boolean;
  isRealAdmin: boolean;
  loading: boolean;
  simulationAdminActive: boolean;
  setSimulationAdminActive: (active: boolean) => void;
  loginWithGoogle: () => Promise<void>;
  loginAnonymously: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserDisplayName: (name: string) => Promise<void>;
  createDrawing: (drawingData: { id: string; pointsText: string; imageUrl: string; clientWidth: number; clientHeight: number }) => Promise<void>;
  deleteDrawingAdmin: (drawingId: string) => Promise<void>;
  banUserAdmin: (targetUserId: string, targetEmail: string, reason: string) => Promise<void>;
  unbanUserAdmin: (targetUserId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [allDrawingsAdmin, setAllDrawingsAdmin] = useState<Drawing[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulationAdminActive, setSimulationAdminActive] = useState(false);

  // Derive genuine Admin status from real auth profile (ignaciomaino22@gmail.com verified)
  const isRealAdmin = !!(user?.email && user.emailVerified && user.email === 'ignaciomaino22@gmail.com');
  const isAdmin = isRealAdmin || simulationAdminActive;

  // Track if current user is banned
  const isBanned = user ? bans.some(b => b.userId === user.uid) : false;

  // Listen to Auth State
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Clean up previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(currentUser);
      
      if (currentUser) {
        // Build or fetch user profile
        const userRef = doc(db, 'users', currentUser.uid);
        unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile(snapshot.data() as UserProfile);
          } else {
            // First time joining, provision basic structure
            const newProfile: UserProfile = {
              userId: currentUser.uid,
              displayName: currentUser.displayName || `Jugador ${currentUser.uid.slice(0, 4)}`,
              joinedAt: new Date().toISOString()
            };
            setDoc(userRef, {
              ...newProfile,
              joinedAt: serverTimestamp()
            }).catch(err => {
              console.error("Failed to provision default profile: ", err);
            });
          }
          setLoading(false);
        }, (err) => {
          console.error("Profile snapshot listener error", err);
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  // Listen to Drawings (real-time cooperative board)
  useEffect(() => {
    if (loading) return;

    const drawingsCollectionRef = collection(db, 'drawings');
    // Active non-deleted drawings for the public canvas board
    const qActive = query(drawingsCollectionRef, where('isDeleted', '==', false), orderBy('createdAt', 'asc'));

    const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
      const activeDrawings: Drawing[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        activeDrawings.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt
        } as Drawing);
      });
      setDrawings(activeDrawings);
    }, (error) => {
      // Catch and log/re-throw with handling system
      handleFirestoreError(error, OperationType.GET, 'drawings(active)');
    });

    return () => {
      unsubscribeActive();
    };
  }, [loading]);

  // Listen to All Drawings for Admin panel (including soft-deleted)
  useEffect(() => {
    if (!isAdmin || loading) {
      setAllDrawingsAdmin([]);
      return;
    }

    const drawingsCollectionRef = collection(db, 'drawings');
    const qAll = query(drawingsCollectionRef, orderBy('createdAt', 'desc'));

    const unsubscribeAll = onSnapshot(qAll, (snapshot) => {
      const allDrawings: Drawing[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        allDrawings.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt
        } as Drawing);
      });
      setAllDrawingsAdmin(allDrawings);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'drawings(all)');
    });

    return () => {
      unsubscribeAll();
    };
  }, [isAdmin, loading]);

  // Listen to Bans Collection
  useEffect(() => {
    if (loading) return;

    const bansCollectionRef = collection(db, 'bans');
    const unsubscribeBans = onSnapshot(bansCollectionRef, (snapshot) => {
      const banRecords: BanRecord[] = [];
      snapshot.forEach((docSnap) => {
        banRecords.push(docSnap.data() as BanRecord);
      });
      setBans(banRecords);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bans');
    });

    return () => {
      unsubscribeBans();
    };
  }, [loading]);

  // Automatically clear bans if the official admin logs in
  useEffect(() => {
    if (isRealAdmin) {
      const clearBans = async () => {
        try {
          const bansCollectionRef = collection(db, 'bans');
          const snapshot = await getDocs(bansCollectionRef);
          if (snapshot.size > 0) {
            console.log(`Auto-despenalizando ${snapshot.size} cuentas de usuario...`);
            const deletions = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'bans', docSnap.id)));
            await Promise.all(deletions);
            console.log("Todas las cuentas han sido despenalizadas exitosamente.");
          }
        } catch (error) {
          console.error("Error al auto-despenalizar cuentas:", error);
        }
      };
      clearBans();
    }
  }, [isRealAdmin]);

  // ----------------------------------------------------
  // Core Functions
  // ----------------------------------------------------

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google authentication failed:", error);
    }
  };

  const loginAnonymously = async (name: string) => {
    try {
      const credential = await signInAnonymously(auth);
      if (credential.user) {
        const userRef = doc(db, 'users', credential.user.uid);
        await setDoc(userRef, {
          userId: credential.user.uid,
          displayName: name.trim() || `Invitado ${credential.user.uid.slice(0, 4)}`,
          joinedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Anonymous authentication failed:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setSimulationAdminActive(false);
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  };

  const updateUserDisplayName = async (name: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        userId: user.uid,
        displayName: name.trim(),
        joinedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const createDrawing = async (drawingData: {
    id: string;
    pointsText: string;
    imageUrl: string;
    clientWidth: number;
    clientHeight: number;
  }) => {
    if (!user) throw new Error("Acción bloqueada: Usuario no autenticado.");
    if (isBanned) throw new Error("Acción bloqueada: El usuario está baneado temporalmente.");

    const path = `drawings/${drawingData.id}`;
    try {
      await setDoc(doc(db, 'drawings', drawingData.id), {
        id: drawingData.id,
        userId: user.uid,
        userName: userProfile?.displayName || user.displayName || 'Anonimo',
        pointsText: drawingData.pointsText,
        imageUrl: drawingData.imageUrl,
        clientWidth: drawingData.clientWidth,
        clientHeight: drawingData.clientHeight,
        createdAt: serverTimestamp(),
        isDeleted: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // Admin moderation: soft delete drawing
  const deleteDrawingAdmin = async (drawingId: string) => {
    if (!isAdmin) throw new Error("Acción no autorizada: Se requiere rol de administrador.");
    const path = `drawings/${drawingId}`;
    try {
      const docRef = doc(db, 'drawings', drawingId);
      // Soft-delete to keep it logged in the system while removing from canvas
      await setDoc(docRef, { isDeleted: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // Admin moderation: Ban user
  const banUserAdmin = async (targetUserId: string, targetEmail: string, reason: string) => {
    if (!isRealAdmin) throw new Error("Acción bloqueada: Solo el Administrador Oficial puede penalizar usuarios.");
    const path = `bans/${targetUserId}`;
    try {
      await setDoc(doc(db, 'bans', targetUserId), {
        userId: targetUserId,
        bannedEmail: targetEmail || 'Invitado (Sin Email)',
        bannedAt: serverTimestamp(),
        bannedBy: user?.uid || 'Admin',
        reason: reason || 'Infracción de las directrices'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // Admin moderation: Unban user
  const unbanUserAdmin = async (targetUserId: string) => {
    if (!isRealAdmin) throw new Error("Acción bloqueada: Solo el Administrador Oficial puede despenalizar usuarios.");
    const path = `bans/${targetUserId}`;
    try {
      await deleteDoc(doc(db, 'bans', targetUserId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <FirebaseContext.Provider value={{
      user,
      userProfile,
      drawings,
      allDrawingsAdmin,
      bans,
      isBanned,
      isAdmin,
      isRealAdmin,
      loading,
      simulationAdminActive,
      setSimulationAdminActive,
      loginWithGoogle,
      loginAnonymously,
      logout,
      updateUserDisplayName,
      createDrawing,
      deleteDrawingAdmin,
      banUserAdmin,
      unbanUserAdmin
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
