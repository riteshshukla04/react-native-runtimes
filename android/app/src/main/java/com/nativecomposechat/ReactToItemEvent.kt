package com.nativecomposechat

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class ReactToItemEvent(
    surfaceId: Int,
    viewId: Int,
    private val payload: WritableMap,
) : Event<ReactToItemEvent>(surfaceId, viewId) {
  override fun getEventName(): String = "topReactToItem"

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap = payload
}
