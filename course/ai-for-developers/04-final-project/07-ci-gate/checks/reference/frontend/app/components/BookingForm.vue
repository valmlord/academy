<script setup lang="ts">
import { useApiClient } from '~/api/client'
import { localHhmm } from '~/utils/localTime'

const props = defineProps<{ eventTypeId: string; start: string; tz: string }>()
const client = useApiClient()
const name = ref('')
const email = ref('')
const outcome = ref<'idle' | 'booked' | 'taken' | 'failed'>('idle')

async function submit() {
  const { response } = await client.POST('/bookings', {
    body: { eventTypeId: props.eventTypeId, start: props.start, inviteeName: name.value, inviteeEmail: email.value, inviteeTimeZone: props.tz },
  })
  outcome.value = response.status === 201 ? 'booked' : response.status === 409 ? 'taken' : 'failed'
}
</script>

<template>
  <form @submit.prevent="submit">
    <p>Встреча в {{ localHhmm(start, tz) }}</p>
    <label>Имя <input v-model="name" name="inviteeName" required maxlength="120"></label>
    <label>Email <input v-model="email" name="inviteeEmail" type="email" required></label>
    <button type="submit">Забронировать</button>
    <p v-if="outcome === 'booked'" role="status">Встреча забронирована.</p>
    <p v-if="outcome === 'taken'" role="alert">Это время только что заняли. Выберите другое.</p>
    <p v-if="outcome === 'failed'" role="alert">Не удалось забронировать. Попробуйте ещё раз.</p>
  </form>
</template>
