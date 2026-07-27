export type MissingDog = {
  id: string
  owner_id: string | null
  name: string
  breed_details: string | null
  photo_url: string | null
  reward: number
  contact_info: string
  latitude: number
  longitude: number
  last_seen: string | null
  status: string
  created_at: string
  found_by: string | null
  found_photo_url: string | null
  found_note: string | null
  found_at: string | null
}

export type Volunteer = {
  id: string
  dog_id: string
  volunteer_name: string
  volunteer_contact: string | null
  message: string | null
  created_at: string
}


export type Notification = {
  id: string
  user_id: string
  dog_id: string | null
  type: string
  title: string
  message: string
  read_at: string | null
  created_at: string
}
