<script setup lang="ts">
import { isValidDate, isValidTimeZone } from '~/utils/localTime'

const route = useRoute()
const eventTypeId = String(route.params.eventTypeId)
const date = String(route.query.date ?? '')
const tz = String(route.query.tz ?? '')
const isRequestValid = isValidDate(date) && isValidTimeZone(tz)
</script>

<template>
  <main>
    <h1>Запись на встречу</h1>
    <SlotPicker v-if="isRequestValid" :event-type-id="eventTypeId" :date="date" :tz="tz" />
    <p v-else>Укажите в адресе дату (?date=ГГГГ-ММ-ДД) и часовой пояс (&tz=Europe/Berlin).</p>
  </main>
</template>
