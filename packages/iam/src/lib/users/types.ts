export type User = {
  email: string;
  userId: string;
  userName: string;
  profilePictureUrl: string;
  role: string;
  isOrgOwner: boolean;
  agreedToTos: boolean;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  namespaceId: string;
  createdByUserId: string;
  validUntil: Date;
};
