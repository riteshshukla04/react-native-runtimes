package com.nativecomposechat

import android.content.Context
import android.util.Log
import android.view.View
import android.widget.FrameLayout

class ComposeChatBackgroundHostView(context: Context) : FrameLayout(context) {
  private companion object {
    const val FABRIC_HOST_INVENTORY_LOG_TAG = "FabricHostInventory"
  }

  private val fabricChildren = mutableListOf<ComposeChatListItemView>()
  private var listName = "compose-chat-list"

  val fabricChildCount: Int
    get() = fabricChildren.size

  fun setListName(nextListName: String) {
    if (listName == nextListName) return

    fabricChildren.forEach { child ->
      BackgroundListRuntime.detachFabricChild(listName, child)
    }
    listName = nextListName
    fabricChildren.forEach { child ->
      BackgroundListRuntime.attachFabricChild(listName, child)
    }
    logFabricInventory("backgroundHostListNameChange")
  }

  fun addFabricChild(child: View, index: Int) {
    val cell = child as? ComposeChatListItemView ?: return
    if (fabricChildren.contains(cell)) return

    fabricChildren.add(index.coerceIn(0, fabricChildren.size), cell)
    BackgroundListRuntime.attachFabricChild(listName, cell)
    logFabricInventory("backgroundHostAdd requestedIndex=$index")
  }

  fun removeFabricChild(child: View) {
    val cell = child as? ComposeChatListItemView ?: return
    fabricChildren.remove(cell)
    BackgroundListRuntime.detachFabricChild(listName, cell)
    logFabricInventory("backgroundHostRemove")
  }

  fun removeFabricChildAt(index: Int) {
    val cell = fabricChildren.getOrNull(index) ?: return
    removeFabricChild(cell)
  }

  fun removeAllFabricChildren() {
    fabricChildren.toList().forEach { child -> removeFabricChild(child) }
  }

  fun getFabricChildAt(index: Int): View? = fabricChildren.getOrNull(index)

  private fun logFabricInventory(reason: String) {
    val pool =
        fabricChildren.mapIndexed { poolIndex, cell ->
          "$poolIndex:${cell.activeItemIndex()}:${cell.itemId.ifEmpty { "unset" }}:" +
              "${cell.hostSlot.ifEmpty { "unset" }}:children=${cell.childCount}:" +
              "parent=${cell.parent?.javaClass?.simpleName ?: "none"}"
        }
    Log.i(
        FABRIC_HOST_INVENTORY_LOG_TAG,
        "$reason backgroundList=$listName poolSize=${fabricChildren.size} " +
            "pool=[${pool.joinToString(",")}]",
    )
  }
}
