package com.nativecomposechat

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class RequestItemsEvent(
    surfaceId: Int,
    viewTag: Int,
    private val payload: WritableMap,
) : Event<RequestItemsEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "topRequestItems"

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap = payload
}
