export interface FeedbackDomain {
  id: string;
  userId: string | null;
  body: string;
  read: boolean;
  createdAt: Date;
}
