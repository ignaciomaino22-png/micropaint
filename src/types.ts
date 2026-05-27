export interface UserProfile {
  userId: string;
  displayName: string;
  joinedAt: string;
}

export interface Drawing {
  id: string;
  userId: string;
  userName: string;
  pointsText: string; // Serialized list of coordinates: "x,y;x,y;..."
  imageUrl: string;   // Compressed base64 string
  clientWidth: number;
  clientHeight: number;
  createdAt: any;     // Firebase Timestamp
  isDeleted: boolean;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface BanRecord {
  userId: string;
  bannedEmail: string;
  bannedAt: string;
  bannedBy: string;
  reason: string;
}
