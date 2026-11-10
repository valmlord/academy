<script setup lang="ts">
import { useApiClient } from '~/api/client'
import { isValidDate, localDate, localHhmm, queryRangeFor } from '~/utils/localTime'

const props = defineProps<{ eventTypeId: string; date: string; tz: string }>()
const client = useApiClient()

const { data: slots, error } = await useAsyncData(`slots:${props.eventTypeId}:${props.date}:${props.tz}`, async () => {
  if (!isValidDate(props.date)) return []
  const { from, to } = queryRangeFor(props.date)
  const { data, error } = await client.GET('/event-types/{eventTypeId}/slots', {
    params: { path: { eventTypeId: props.eventTypeId }, query: { from, to } },
  })
  if (error) throw createError({ statusCode: error.status, statusMessage: error.title })
  return data.items.filter((slot) => localDate(slot.start, props.tz) === props.date)
})

const chosen = ref<string | null>(null)
</script>

<template>
  <section>
    <p v-if="error">Не удалось загрузить свободное время.</p>
    <p v-else-if="!slots?.length">На эту дату свободного времени нет.</p>
    <ul v-else>
      <li v-for="slot in slots" :key="slot.start">
        <button type="button" :data-slot-start="slot.start" @click="chosen = slot.start">{{ localHhmm(slot.start, tz) }}</button>
      </li>
    </ul>
    <BookingForm v-if="chosen" :key="chosen" :event-type-id="eventTypeId" :start="chosen" :tz="tz" />
  </section>
</template>
