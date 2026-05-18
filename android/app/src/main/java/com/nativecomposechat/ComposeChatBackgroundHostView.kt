package com.nativecomposechat

import android.content.Context
import android.view.View
import android.widget.FrameLayout

class ComposeChatBackgroundHostView(context: Context) : FrameLayout(context) {
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
  }

  fun addFabricChild(child: View, index: Int) {
    val cell = child as? ComposeChatListItemView ?: return
    if (fabricChildren.contains(cell)) return

    fabricChildren.add(index.coerceIn(0, fabricChildren.size), cell)
    BackgroundListRuntime.attachFabricChild(listName, cell)
  }

  fun removeFabricChild(child: View) {
    val cell = child as? ComposeChatListItemView ?: return
    fabricChildren.remove(cell)
    BackgroundListRuntime.detachFabricChild(listName, cell)
  }

  fun removeFabricChildAt(index: Int) {
    val cell = fabricChildren.getOrNull(index) ?: return
    removeFabricChild(cell)
  }

  fun removeAllFabricChildren() {
    fabricChildren.toList().forEach { child -> removeFabricChild(child) }
  }

  fun getFabricChildAt(index: Int): View? = fabricChildren.getOrNull(index)
}
