export type MissingDog = {
  id: string
  owner_id: string | null
  name: string
  breed_details: string | null
  photo_url: string | null
  photo_path?: string | null
  reward: number
  contact_info: string
  latitude: number
  longitude: number
  last_seen: string | null
  status: string
  created_at: string
  found_by: string | null
  found_by_user_id?: string | null
  found_photo_url: string | null
  found_photo_path?: string | null
  found_note: string | null
  found_at: string | null
}

export type Sighting = {
  id: string
  reporter_id: string
  dog_id: string | null
  title: string
  description: string | null
  photo_url: string | null
  photo_path: string | null
  latitude: number
  longitude: number
  seen_at: string
  contact_info: string | null
  status: string
  created_at: string
}

export type Volunteer = {
  id: string
  dog_id: string
  user_id: string | null
  volunteer_name: string
  volunteer_contact: string | null
  message: string | null
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  actor_id: string | null
  dog_id: string | null
  conversation_id: string | null
  type: string
  title: string
  message: string
  read_at: string | null
  created_at: string
}

export type Conversation = {
  id: string
  dog_id: string
  owner_id: string
  volunteer_id: string
  source_type?: "volunteer" | "sighting" | "found"
  source_id?: string | null
  created_at: string
  last_message_at: string
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  edited_at: string | null
}
